/// <reference lib="dom" />
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import {
  ActivityCollection,
  AddressCollection,
  AddressModel,
  AppConfigCollection,
  OrgCollection,
  PersonalRelCollection,
  PersonCollection,
  PersonPrivacyPreferences,
  PrivacyAccessor,
  PrivacySettings,
  Roles,
  WorkrelCollection,
} from '@okr/shared-models';
import { DateFormat, getTodayStr, zurichStoreDate } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, projectAddressesForViewer } from '@okr/shared-util-functions';
import {
  buildVCardFile,
  ExportScope,
  resolveVcardCapability,
  VCARD_INLINE_LIMIT_BYTES,
  VcardChannelType,
  VcardExportRequest,
  VcardExportResponse,
  VcardRecord,
  VcardTargetKind,
} from '@okr/vcard-util';
import { fetchAvatarBase64, FsData, toVcardRecord } from './record';

export { resolveBdayIso } from './record';

const REGION = 'europe-west6';
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

const ALL_CHANNELS: VcardChannelType[] = ['phone', 'email', 'postal', 'web'];

/**
 * Tier-1 scope: favorites of every channel, plus the birthday.
 *
 * `birthday: true` does NOT mean every tier-1 export carries a BDAY — it means the decision is
 * the projection's, not this constant's. `assembleRecord` reads the dob from the addresses the
 * `registered`-tier projection returned, so a person whose `usageDateOfBirth` is `Protected`
 * simply has no dob address in hand and no BDAY is emitted. Public/Restricted (i.e. < Protected)
 * export their birthday to fellow members, which is what the §A2 amendment made possible:
 * before it, the `privileged` channel floor withheld the value anyway, so this flag was `false`
 * to avoid promising something the projection would never deliver.
 */
const FAVORITES_SCOPE: ExportScope = {
  identity: true,
  addresses: ALL_CHANNELS,
  birthday: true,
  photo: false,
  workRels: false,
  personalRels: false,
  orgLinks: false,
};


/** Never trust the client's scope: validate its shape and coerce booleans. */
function clampScope(scope: ExportScope | undefined): ExportScope {
  const addresses = Array.isArray(scope?.addresses)
    ? scope!.addresses.filter((c): c is VcardChannelType => ALL_CHANNELS.includes(c as VcardChannelType))
    : ALL_CHANNELS;
  return {
    identity: true,
    addresses,
    birthday: scope?.birthday === true,
    photo: scope?.photo === true,
    workRels: scope?.workRels === true,
    personalRels: scope?.personalRels === true,
    // orgLinks is omitted in this release — never emit parent/child org links
    orgLinks: false,
  };
}

function belongsToTenant(data: FsData | undefined, tenantId: string): boolean {
  return !!data && Array.isArray(data['tenants']) && data['tenants'].includes(tenantId) && data['isArchived'] !== true;
}

async function assembleRecord(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  kind: VcardTargetKind,
  key: string,
  scope: ExportScope,
  favoritesOnly: boolean,
  viewerAccessor: PrivacyAccessor,
  settings: Partial<PrivacySettings> | undefined,
): Promise<VcardRecord | null> {
  const subjectKey = `${kind}.${key}`;
  const docSnap = await db.collection(kind === 'person' ? PersonCollection : OrgCollection).doc(key).get();
  const data = docSnap.data();
  if (!docSnap.exists || !belongsToTenant(data, tenantId)) return null;

  // addresses (single equality query, tenant-filtered in memory to avoid composite indexes),
  // then privacy-filtered through the D8 chokepoint: the person's usage* preferences and the
  // tenant floors apply per the caller's tier (spec 1.19 Phase 4).
  const addrSnap = await db.collection(AddressCollection).where('parentKey', '==', subjectKey).get();
  const rawAddresses = addrSnap.docs.map((d) => d.data()).filter((a) => belongsToTenant(a, tenantId));
  const today = zurichStoreDate();
  const addresses: FsData[] = projectAddressesForViewer(
    rawAddresses as unknown as AddressModel[], viewerAccessor, kind,
    kind === 'person' ? (data as Partial<PersonPrivacyPreferences>) : undefined,
    settings,
    today,
  ) as unknown as FsData[];

  let workrels: FsData[] = [];
  if (scope.workRels) {
    const wSnap = await db.collection(WorkrelCollection).where(kind === 'person' ? 'subjectKey' : 'objectKey', '==', key).get();
    workrels = wSnap.docs.map((d) => d.data()).filter((w) => belongsToTenant(w, tenantId));
  }

  let personalRels: { subject: FsData[]; object: FsData[] } | undefined;
  if (kind === 'person' && scope.personalRels) {
    const [subjSnap, objSnap] = await Promise.all([
      db.collection(PersonalRelCollection).where('subjectKey', '==', key).get(),
      db.collection(PersonalRelCollection).where('objectKey', '==', key).get(),
    ]);
    const subjIds = new Set(subjSnap.docs.map((d) => d.id));
    personalRels = {
      subject: subjSnap.docs.map((d) => d.data()).filter((r) => belongsToTenant(r, tenantId)),
      // a rel in which the person is both subject and object is listed once (subject side)
      object: objSnap.docs.filter((d) => !subjIds.has(d.id)).map((d) => d.data()).filter((r) => belongsToTenant(r, tenantId)),
    };
  }

  const photoBase64 = scope.photo ? await fetchAvatarBase64(db, tenantId, kind, key) : undefined;
  return toVcardRecord({ kind, key, data: data!, addresses, workrels, personalRels, scope, favoritesOnly, photoBase64, today });
}

function slugify(name: string): string {
  const s = (name ?? 'contact')
    .normalize('NFKD')
    // eslint-disable-next-line no-control-regex
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return s.length > 0 ? s : 'contact';
}

/**
 * Single callable for all vCard exports (spec §7). Enforces scope and the
 * tier cap server-side, assembles records with the Admin SDK, builds the `.vcf`
 * with the shared generator, writes one activity entry, and returns the payload
 * inline (or as a signed Storage URL when large).
 */
export const vcardExport = onCall<VcardExportRequest>(
  { region: REGION, enforceAppCheck: true },
  async (request): Promise<VcardExportResponse> => {
    const CF = 'vcardExport';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkAppCheckToken(request as any, CF);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkAuthentication(request as any, CF);

    const uid = request.auth!.uid;
    const { tenantId, targetIds, targetKind } = request.data;
    if (!tenantId) throw new HttpsError('invalid-argument', 'tenantId is required');
    if (!Array.isArray(targetIds) || targetIds.length === 0) throw new HttpsError('invalid-argument', 'targetIds is required');
    if (targetKind !== 'person' && targetKind !== 'org') throw new HttpsError('invalid-argument', 'invalid targetKind');

    const db = getFirestore();

    // Re-derive the caller's roles + tenant membership from Firestore (M-6 pattern).
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.data();
    const roles = (userData?.['roles'] ?? {}) as Roles;
    const userTenants = Array.isArray(userData?.['tenants']) ? (userData!['tenants'] as string[]) : [];
    if (!userTenants.includes(tenantId)) {
      logger.error(`${CF}: caller ${uid} is not a member of tenant ${tenantId}`);
      throw new HttpsError('permission-denied', 'caller is not a member of the tenant.');
    }

    const cap = resolveVcardCapability(roles, targetIds.length);
    if (!cap.allowed) {
      logger.error(`${CF}: caller ${uid} not allowed to export ${targetIds.length} ${targetKind}(s)`);
      throw new HttpsError('permission-denied', 'not allowed to export this selection.');
    }

    const favoritesOnly = cap.scope === 'favorites';
    const effectiveScope = favoritesOnly ? FAVORITES_SCOPE : clampScope(request.data.scope);

    // Caller tier for the privacy projection (D-P4-1): tier 2 (admin/privileged/memberAdmin,
    // full scope) sees the privileged view; tier 1 sees exactly the registered-visible entries.
    const viewerAccessor: PrivacyAccessor = favoritesOnly ? 'registered' : 'privileged';
    const configSnap = await db.collection(AppConfigCollection).doc(tenantId).get();
    const settings = configSnap.exists ? (configSnap.data() as Partial<PrivacySettings>) : undefined;

    const records: VcardRecord[] = [];
    for (const key of targetIds) {
      const rec = await assembleRecord(db, tenantId, targetKind, key, effectiveScope, favoritesOnly, viewerAccessor, settings);
      if (rec) records.push(rec);
    }
    if (records.length === 0) throw new HttpsError('not-found', 'no exportable records found.');

    const vcf = buildVCardFile(records, effectiveScope);
    const bytes = Buffer.byteLength(vcf, 'utf8');
    const recordCount = records.length;
    const ts = getTodayStr(DateFormat.StoreDateTime);
    const filename = targetIds.length === 1 ? `${slugify(records[0].displayName)}.vcf` : `contacts-export-${getTodayStr(DateFormat.IsoDate)}.vcf`;

    // one activity entry per export operation (spec §9)
    await db.collection(ActivityCollection).add({
      tenants: [tenantId],
      isArchived: false,
      timestamp: ts,
      scope: 'vcard',
      action: 'export',
      roleNeeded: 'admin',
      payload: JSON.stringify({ actorId: uid, targetKind, targetIds, scope: effectiveScope, recordCount }),
      index: `t:${ts} c:vcard a:export`,
      author: null,
      createdAt: FieldValue.serverTimestamp(),
    });

    if (bytes > VCARD_INLINE_LIMIT_BYTES) {
      const objectPath = `tmp/vcard-export/${tenantId}/${uid}-${ts}.vcf`;
      const file = getStorage().bucket().file(objectPath);
      await file.save(Buffer.from(vcf, 'utf8'), { contentType: 'text/vcard; charset=utf-8', resumable: false });
      const [downloadUrl] = await file.getSignedUrl({ action: 'read', expires: Date.now() + SIGNED_URL_TTL_MS });
      logger.info(`${CF}: ${recordCount} record(s), ${bytes} bytes → signed URL`);
      return { filename, downloadUrl, recordCount };
    }

    logger.info(`${CF}: ${recordCount} record(s), ${bytes} bytes → inline`);
    return { filename, vcardBase64: Buffer.from(vcf, 'utf8').toString('base64'), recordCount };
  },
);
