// apps/functions/src/business/index.ts
import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import {
  CommissionEntryCollection, MeteringRecordCollection, OrgCollection, PartnerCollection,
  ProspectCollection, AddressCollection,
} from '@okr/shared-models';
import type { MeteringRecordModel, PartnerModel, ProspectModel } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import {
  commissionEntryId, commissionForTenant, heartbeatStatus, meteringRecordId, missingTenants,
  shiftPeriod, toMeteringRecord, validatePayload,
} from '@okr/business-metering-util';
import type { BandId, MeteringPayload } from '@okr/business-metering-util';
import { convertProspect } from '@okr/business-prospect-util';

export { pushMeteringToPlatform } from './push';

const REGION = 'europe-west6';

/** Everything the partner channel writes lives in the platform tenant (C3 §6). */
const PLATFORM_TENANT = 'kring';

function nowStamp(): string {
  return new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/**
 * Resolve the calling installation to a partner record.
 *
 * The identity is a uid recorded on the partner (`serviceUid`), not a `partner` role: this uid can
 * do exactly what these callables allow and nothing else, and it stays out of both the eight
 * billable roles (pricing §9.1) and every `isPrivileged()` branch in `firestore.rules`.
 */
async function requirePartner(request: CallableRequest, fnName: string): Promise<PartnerModel> {
  // NO App Check here, deliberately: the caller is the partner's scheduled Cloud Function (C3 §3),
  // and App Check attests *client apps* — there is no server attestation to obtain, so requiring it
  // would make the push impossible rather than safer. The credential is the service identity's ID
  // token, which bkaiser issues and can disable unilaterally.
  checkAuthentication(request, fnName);
  const uid = request.auth?.uid ?? '';
  const snap = await getFirestore().collection(PartnerCollection)
    .where('serviceUid', '==', uid).limit(1).get();
  if (snap.empty) {
    logger.error(`${fnName}: uid ${uid} is not a registered partner identity`);
    throw new HttpsError('permission-denied', 'Not a registered partner identity.');
  }
  const doc = snap.docs[0];
  return { ...(doc.data() as PartnerModel), okey: doc.id };
}

/**
 * C3 §6 — the metering ingest. Push, never pull: a pull would mean every partner exposing an
 * inbound API on infrastructure bkaiser does not operate, secured by a party who may not be
 * technical.
 *
 * Idempotent by construction: the record id is `{partnerKey}_{tenantId}_{period}`, so a retried
 * push overwrites its own rows. The heartbeat is stamped **whatever the payload contained** —
 * C2 §13.3's termination trigger is an ABSENT heartbeat, and a payload that arrives but fails
 * validation is a support case, not a breach of the reporting duty.
 */
export const pushMetering = onCall(
  { region: REGION },
  async (request) => {
    const partner = await requirePartner(request, 'pushMetering');
    const db = getFirestore();
    const receivedAt = nowStamp();

    // The heartbeat comes FIRST and unconditionally — see the doc comment.
    await db.collection(PartnerCollection).doc(partner.okey).update({ lastHeartbeatAt: receivedAt });

    const payload = (request.data ?? {}) as Partial<MeteringPayload>;
    const verdict = validatePayload(payload);
    if (verdict.fatal) {
      throw new HttpsError('invalid-argument', verdict.fatal);
    }
    if (payload.partnerKey !== partner.okey) {
      // C3 §6: a payload may not claim to be somebody else's.
      throw new HttpsError('permission-denied', 'partnerKey does not match the authenticated caller.');
    }
    const period = payload.period as string;

    const batch = db.batch();
    for (const row of verdict.accepted) {
      const id = meteringRecordId(partner.okey, row.tenantId, period);
      const record = toMeteringRecord(row, partner.okey, period, PLATFORM_TENANT, receivedAt);
      const { okey, ...data } = record;   // okey IS the doc id and is never stored (repo convention)
      void okey;
      batch.set(db.collection(MeteringRecordCollection).doc(id), data);
    }
    if (verdict.accepted.some(r => (r.version ?? '').length > 0)) {
      batch.update(db.collection(PartnerCollection).doc(partner.okey),
        { reportedVersion: verdict.accepted[0].version ?? '' });
    }
    await batch.commit();

    // C5 §7 — conversion is OBSERVED here, never self-declared. `convertProspect` refuses a
    // prospect this partner does not hold, so a push cannot register somebody else's lead.
    const converted: string[] = [];
    for (const row of verdict.accepted.filter(r => (r.prospectKey ?? '').length > 0)) {
      const ref = db.collection(ProspectCollection).doc(row.prospectKey as string);
      const snap = await ref.get();
      if (!snap.exists) continue;
      const prospect = { ...(snap.data() as ProspectModel), okey: snap.id };
      const next = convertProspect(prospect, partner.okey, row.tenantId);
      if (!next) {
        logger.warn(`pushMetering: ${partner.okey} named prospect ${row.prospectKey} it does not hold`);
        continue;
      }
      await ref.update({
        status: next.status, convertedTenantId: next.convertedTenantId, convertedAt: next.convertedAt,
      });
      converted.push(row.prospectKey as string);
    }

    // 1.26 §6 follow-up (c): nothing stops a `bkg` user dropping `kring` from the partner org's
    // `tenants`, which silently breaks the join between the ledger and the company that gets the
    // invoice. Checked here because this is the only moment the join is actually exercised, and
    // logged rather than thrown: the partner did their duty, the defect is on bkaiser's side.
    if (partner.orgKey) {
      const org = await db.collection(OrgCollection).doc(partner.orgKey).get();
      if (!org.exists) {
        logger.error(`pushMetering: partner ${partner.okey} references a missing org ${partner.orgKey}`);
      } else if (!((org.get('tenants') as string[] | undefined) ?? []).includes(PLATFORM_TENANT)) {
        logger.error(`pushMetering: org ${partner.orgKey} of partner ${partner.okey} is no longer shared into ${PLATFORM_TENANT} — the invoicing join is broken`);
      }
    }

    // The under-report signal (C3 §6): a tenant that was there last month and is gone now.
    const previousPeriod = shiftPeriod(period, -1);
    const previousSnap = await db.collection(MeteringRecordCollection)
      .where('partnerKey', '==', partner.okey).where('period', '==', previousPeriod).get();
    const vanished = missingTenants(
      previousSnap.docs.map(d => (d.data() as MeteringRecordModel).tenantId),
      verdict.accepted.map(r => r.tenantId));
    if (vanished.length > 0) {
      logger.warn(`pushMetering: ${partner.okey} stopped reporting ${vanished.join(', ')} in ${period}`);
    }

    logger.info(`pushMetering: ${partner.okey} ${period} — ${verdict.accepted.length} accepted, ${verdict.rejected.length} rejected`);
    return {
      accepted: verdict.accepted.length,
      rejected: verdict.rejected,
      converted,
      vanished,
    };
  },
);

/**
 * C3 §7 — the monthly commission run. Admin-triggered rather than scheduled: a run is cheap to
 * repeat and expensive to have fire while a late push is still arriving.
 *
 * Rebuilding a period is safe — the entry id matches the record id, so a re-run overwrites.
 */
export const runCommission = onCall(
  { region: REGION },
  async (request) => {
    checkAppCheckToken(request, 'runCommission');
    checkAuthentication(request, 'runCommission');
    const db = getFirestore();
    const uid = request.auth?.uid ?? '';
    const user = await db.collection('users').doc(uid).get();
    if ((user.data()?.['roles'] ?? {})['admin'] !== true) {
      throw new HttpsError('permission-denied', 'runCommission requires the admin role.');
    }

    const period = String((request.data ?? {}).period ?? '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new HttpsError('invalid-argument', 'period must be yyyy-mm');
    }

    const records = await db.collection(MeteringRecordCollection).where('period', '==', period).get();
    const computedAt = nowStamp();
    const batch = db.batch();
    let total = 0;

    for (const doc of records.docs) {
      const record = doc.data() as MeteringRecordModel;
      // Hysteresis is bkaiser-side (pricing §9.1): it is a decision about two months, so it reads
      // the bands actually BILLED before, never a recomputed measurement.
      const history = await billedHistory(db, record.partnerKey, record.tenantId, period);
      const result = commissionForTenant({
        totalUsers: record.totalUsers,
        privilegedUsers: record.privilegedUsers,
        addOns: record.addOns ?? [],
        history,
      });
      if (result.unknownAddOns.length > 0) {
        logger.warn(`runCommission: ${record.partnerKey}/${record.tenantId} reported unpriced add-ons ${result.unknownAddOns.join(', ')}`);
      }
      const id = commissionEntryId(record.partnerKey, record.tenantId, period);
      batch.set(db.collection(CommissionEntryCollection).doc(id), {
        tenants: [PLATFORM_TENANT],
        isArchived: false,
        partnerKey: record.partnerKey,
        tenantId: record.tenantId,
        period,
        weightedUsers: result.weightedUsers,
        band: result.band,
        bandPrice: result.bandPrice,
        addOnTotal: result.addOnTotal,
        subtotal: result.subtotal,
        commission: result.commission,
        computedAt,
      });
      total += result.commission;
    }
    await batch.commit();
    logger.info(`runCommission: ${period} — ${records.size} entries, CHF ${total.toFixed(2)} total`);
    return { entries: records.size, total };
  },
);

/** The two bands billed before `period`, most recent first — the input `applyHysteresis` wants. */
async function billedHistory(
  db: FirebaseFirestore.Firestore, partnerKey: string, tenantId: string, period: string,
): Promise<BandId[]> {
  const ids = [shiftPeriod(period, -1), shiftPeriod(period, -2)]
    .map(p => commissionEntryId(partnerKey, tenantId, p));
  const docs = await db.getAll(...ids.map(id => db.collection(CommissionEntryCollection).doc(id)));
  return docs.filter(d => d.exists).map(d => d.get('band') as BandId);
}

/**
 * C2 §13.3 — daily check for partners who have gone quiet. Logs only: the notice and the
 * termination right are bkaiser's decisions to take, not a function's, and a job that suspended
 * a partner automatically would do so on the strength of a missed cron run.
 */
export const checkPartnerHeartbeats = onSchedule(
  { region: REGION, schedule: '0 7 * * *', timeZone: 'Europe/Zurich' },
  async () => {
    const db = getFirestore();
    const partners = await db.collection(PartnerCollection).where('status', '==', 'active').get();
    for (const doc of partners.docs) {
      const status = heartbeatStatus(doc.get('lastHeartbeatAt') ?? '');
      if (status !== 'ok') {
        logger.warn(`checkPartnerHeartbeats: ${doc.id} is at '${status}' (last heartbeat ${doc.get('lastHeartbeatAt') || 'never'})`);
      }
    }
  },
);

/**
 * C5 §2 — the public signup on kring.ch (and the `okr` demo).
 *
 * Unauthenticated by design, App Check only: the person filling in the form has no account, and
 * requiring one would defeat the purpose of a lead form. The record is created by the Admin SDK, so
 * `firestore.rules` never has to allow anonymous writes to `prospects`.
 *
 * The contact details are written as an `AddressModel` under `parentKey = 'prospect.<okey>'`
 * (C5 §5), not as fields on the prospect: a lead's e-mail belongs in the same vault as every other
 * contact datum, under the same rules and the same erasure path.
 */
export const submitProspect = onCall(
  { region: REGION },
  async (request) => {
    checkAppCheckToken(request, 'submitProspect');

    const data = (request.data ?? {}) as Record<string, string>;
    const name = (data['name'] ?? '').trim();
    const contactName = (data['contactName'] ?? '').trim();
    const email = (data['email'] ?? '').trim().toLowerCase();
    if (name.length === 0 || email.length === 0) {
      throw new HttpsError('invalid-argument', 'name and email are required.');
    }
    // Consent is the legal basis (Vertragswerk Teil III.2) and the notice states the onward
    // transfer to a partner, so a submission without it must not be stored at all.
    if (data['consent'] !== 'true' && (request.data ?? {}).consent !== true) {
      throw new HttpsError('failed-precondition', 'Consent is required.');
    }

    const db = getFirestore();
    const at = nowStamp();
    const ref = db.collection(ProspectCollection).doc();
    const prospect: Omit<ProspectModel, 'okey'> = {
      tenants: [PLATFORM_TENANT],
      isArchived: false,
      name,
      index: `name:${name.toLowerCase()}`,
      tags: '',
      notes: '',
      segment: (data['segment'] as ProspectModel['segment']) ?? 'club',
      contactName,
      source: (data['source'] ?? 'kring.ch').slice(0, 60),
      status: 'open',
      claimedByPartnerKey: '',
      claimedAt: '',
      claimExpiresAt: '',
      convertedTenantId: '',
      convertedAt: '',
      consentAt: at,
      revokedAt: '',
    };
    await ref.set(prospect);

    await db.collection(AddressCollection).add({
      tenants: [PLATFORM_TENANT],
      isArchived: false,
      parentKey: `prospect.${ref.id}`,
      addressChannel: 'email',
      email,
      label: 'signup',
      isFavorite: true,
    });

    logger.info(`submitProspect: created ${ref.id} from ${prospect.source}`);
    return { okey: ref.id };
  },
);
