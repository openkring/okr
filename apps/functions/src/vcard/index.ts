/// <reference lib="dom" />
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import {
  ActivityCollection,
  AddressCollection,
  AvatarCollection,
  OrgCollection,
  PersonalRelCollection,
  PersonCollection,
  Roles,
  WorkrelCollection,
} from '@bk2/shared-models';
import { convertDateFormatToString, DateFormat, getCountryData, getTodayStr } from '@bk2/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@bk2/shared-util-functions';
import {
  buildVCardFile,
  ExportScope,
  resolveVcardCapability,
  toAppleRelationLabel,
  VCARD_INLINE_LIMIT_BYTES,
  VcardChannel,
  VcardChannelType,
  VcardEmployment,
  VcardExportRequest,
  VcardExportResponse,
  VcardRecord,
  VcardRelatedName,
  VcardTargetKind,
} from '@bk2/vcard-util';

const REGION = 'europe-west6';
const IMGIX_BASE = 'https://bkaiser.imgix.net';
const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

const ALL_CHANNELS: VcardChannelType[] = ['phone', 'email', 'postal', 'web'];

/** Tier-1 scope: favorites of every channel, nothing else. */
const FAVORITES_SCOPE: ExportScope = {
  identity: true,
  addresses: ALL_CHANNELS,
  birthday: false,
  photo: false,
  workRels: false,
  personalRels: false,
  orgLinks: false,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FsData = Record<string, any>;

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

function mapAddressChannel(addressChannel: string | undefined): VcardChannelType | undefined {
  switch (addressChannel) {
    case 'email':
    case 'phone':
    case 'postal':
    case 'web':
      return addressChannel;
    default:
      return undefined; // 'custom' and unknowns are not vCard channels
  }
}

/** Resolve a display country name (English, per spec example) from an ISO alpha-2 code. */
function countryDisplayName(countryCode: string | undefined): string {
  if (!countryCode) return '';
  const data = getCountryData(countryCode);
  return data?.name || countryCode;
}

function usageToType(channel: VcardChannelType, usage: string | undefined): string | undefined {
  const u = (usage ?? '').toLowerCase();
  if (channel === 'phone') {
    if (u === 'mobile' || u === 'cell') return 'CELL';
    if (u === 'fax') return 'FAX';
  }
  if (u === 'work') return 'WORK';
  if (u === 'home' || u === 'private') return 'HOME';
  return undefined;
}

function buildChannels(addresses: FsData[], scope: ExportScope, favoritesOnly: boolean): VcardChannel[] {
  const channels: VcardChannel[] = [];
  for (const a of addresses) {
    if (favoritesOnly && a['isFavorite'] !== true) continue;
    const channel = mapAddressChannel(a['addressChannel']);
    if (!channel || !scope.addresses.includes(channel)) continue;
    const type = usageToType(channel, a['addressUsage']);
    const pref = a['isFavorite'] === true;
    switch (channel) {
      case 'email':
        if (a['email']) channels.push({ channel, type, pref, value: a['email'] });
        break;
      case 'phone':
        if (a['phone']) channels.push({ channel, type, pref, value: a['phone'] });
        break;
      case 'web':
        if (a['url']) {
          const label = a['addressChannelLabel'] && a['addressChannelLabel'] !== '' ? a['addressChannelLabel'] : undefined;
          channels.push({ channel, type, pref, value: a['url'], label });
        }
        break;
      case 'postal': {
        const street = [a['streetName'], a['streetNumber']].filter((p) => !!p).join(' ').trim();
        channels.push({ channel, type, pref, street, city: a['city'], zip: a['zipCode'], country: countryDisplayName(a['countryCode']) });
        break;
      }
    }
  }
  return channels;
}

async function fetchAvatarBase64(db: FirebaseFirestore.Firestore, key: string): Promise<string | undefined> {
  const snap = await db.collection(AvatarCollection).doc(key).get();
  const storagePath = snap.data()?.['storagePath'] as string | undefined;
  if (!storagePath) return undefined;
  const url = `${IMGIX_BASE}/${storagePath}?fm=jpg&w=256&h=256&fit=crop&crop=faces&auto=compress`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      logger.warn(`vcardExport: avatar fetch returned ${resp.status} for ${key}`);
      return undefined;
    }
    return Buffer.from(await resp.arrayBuffer()).toString('base64');
  } catch (e) {
    logger.warn(`vcardExport: avatar fetch failed for ${key}`, e as Error);
    return undefined;
  }
}

async function assembleRecord(
  db: FirebaseFirestore.Firestore,
  tenantId: string,
  kind: VcardTargetKind,
  key: string,
  scope: ExportScope,
  favoritesOnly: boolean,
): Promise<VcardRecord | null> {
  const subjectKey = `${kind}.${key}`;
  const docSnap = await db.collection(kind === 'person' ? PersonCollection : OrgCollection).doc(key).get();
  const data = docSnap.data();
  if (!docSnap.exists || !belongsToTenant(data, tenantId)) return null;

  // addresses (single equality query, tenant-filtered in memory to avoid composite indexes)
  const addrSnap = await db.collection(AddressCollection).where('parentKey', '==', subjectKey).get();
  const addresses = addrSnap.docs.map((d) => d.data()).filter((a) => belongsToTenant(a, tenantId));
  const channels = buildChannels(addresses, scope, favoritesOnly);

  const relatedNames: VcardRelatedName[] = [];
  let employment: VcardEmployment | undefined;
  let bday: string | undefined;
  let photoBase64: string | undefined;

  if (kind === 'person') {
    const displayName = `${data!['firstName'] ?? ''} ${data!['lastName'] ?? ''}`.trim() || (data!['lastName'] ?? key);

    if (scope.birthday && data!['dateOfBirth']) {
      const iso = convertDateFormatToString(data!['dateOfBirth'], DateFormat.StoreDate, DateFormat.IsoDate, false);
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) bday = iso;
    }

    if (scope.workRels) {
      const wSnap = await db.collection(WorkrelCollection).where('subjectKey', '==', key).get();
      const workrels = wSnap.docs.map((d) => d.data()).filter((w) => belongsToTenant(w, tenantId));
      // stable order: most recent startDate first, else array order
      workrels.sort((a, b) => `${b['validFrom'] ?? ''}`.localeCompare(`${a['validFrom'] ?? ''}`));
      workrels.forEach((w, i) => {
        if (i === 0) {
          employment = { org: w['objectName'], title: w['label'] || w['name'] || undefined, role: w['type'] || undefined };
        } else {
          relatedNames.push({ name: w['objectName'], label: w['label'] || 'Employer' });
        }
      });
    }

    if (scope.personalRels) {
      const [subjSnap, objSnap] = await Promise.all([
        db.collection(PersonalRelCollection).where('subjectKey', '==', key).get(),
        db.collection(PersonalRelCollection).where('objectKey', '==', key).get(),
      ]);
      const seen = new Set<string>();
      const collect = (docs: FirebaseFirestore.QueryDocumentSnapshot[], asSubject: boolean) => {
        for (const d of docs) {
          if (seen.has(d.id)) continue;
          seen.add(d.id);
          const r = d.data();
          if (!belongsToTenant(r, tenantId)) continue;
          const name = asSubject
            ? `${r['objectFirstName'] ?? ''} ${r['objectLastName'] ?? ''}`.trim()
            : `${r['subjectFirstName'] ?? ''} ${r['subjectLastName'] ?? ''}`.trim();
          if (!name) continue;
          relatedNames.push({ name, label: toAppleRelationLabel(r['type'], r['label']) });
        }
      };
      collect(subjSnap.docs, true);
      collect(objSnap.docs, false);
    }

    if (scope.photo) photoBase64 = await fetchAvatarBase64(db, subjectKey);

    return {
      kind,
      firstName: data!['firstName'],
      lastName: data!['lastName'],
      displayName,
      bday,
      photoBase64,
      channels,
      employment,
      relatedNames,
    };
  }

  // organization
  const orgName = data!['name'] ?? key;
  if (scope.workRels) {
    const wSnap = await db.collection(WorkrelCollection).where('objectKey', '==', key).get();
    const workers = wSnap.docs.map((d) => d.data()).filter((w) => belongsToTenant(w, tenantId));
    for (const w of workers) {
      const name = `${w['subjectName2'] ?? ''} ${w['subjectName1'] ?? ''}`.trim();
      if (!name) continue;
      relatedNames.push({ name, label: w['label'] || 'Contact' });
    }
  }
  if (scope.photo) photoBase64 = await fetchAvatarBase64(db, subjectKey);

  return { kind, displayName: orgName, orgName, photoBase64, channels, relatedNames };
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

    const records: VcardRecord[] = [];
    for (const key of targetIds) {
      const rec = await assembleRecord(db, tenantId, targetKind, key, effectiveScope, favoritesOnly);
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
