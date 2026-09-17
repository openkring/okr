import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, Query, DocumentData } from 'firebase-admin/firestore';

import { MemberFeeCollection, MemberFeePosition } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkAdminRole } from '@okr/shared-util-functions';

const REGION = 'europe-west6';
const BATCH = 400;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FsData = Record<string, any>;

/** Iterate a collection in id-ordered pages; runs `fn` per doc. Returns docs seen. */
async function forEachDoc(base: Query<DocumentData>, fn: (id: string, data: FsData) => Promise<void>): Promise<number> {
  let last: string | undefined;
  let seen = 0;
  for (;;) {
    let q = base.orderBy('__name__').limit(BATCH);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      await fn(doc.id, doc.data());
      seen++;
    }
    last = snap.docs[snap.docs.length - 1].id;
    if (snap.size < BATCH) break;
  }
  return seen;
}

/**
 * One-off: convert every legacy `member-fees` document from the eight fee columns to
 * `positions[]`. Idempotent — a document that already has a non-empty `positions` is skipped,
 * so a partial run can simply be repeated.
 */
const COLUMN_MAP: { field: string; key: string; usage: string; label: string }[] = [
  { field: 'jb', key: 'jb', usage: 'membershipFee', label: 'Jahresbeitrag' },
  { field: 'srv', key: 'srv', usage: 'srvFee', label: 'SRV-Beitrag' },
  { field: 'bev', key: 'bev', usage: 'beverages', label: 'Getränke' },
  { field: 'entryFee', key: 'entryFee', usage: 'other', label: 'Eintrittsgebühr' },
  { field: 'locker', key: 'locker', usage: 'lockerRental', label: 'Kästchen' },
  { field: 'hallenTraining', key: 'hallenTraining', usage: 'other', label: 'Hallentraining' },
  { field: 'skiff', key: 'skiff', usage: 'boatPlaceRental', label: 'Skiffplatz' },
  { field: 'skiffInsurance', key: 'skiffInsurance', usage: 'insurance', label: 'Skiffversicherung' },
];

export function toPositions(legacy: Record<string, unknown>): MemberFeePosition[] {
  const positions = COLUMN_MAP
    .filter(c => Number(legacy[c.field] ?? 0) !== 0)
    .map(c => ({ key: c.key, usage: c.usage, type: 'fix', label: c.label,
      amount: Number(legacy[c.field]), accountKey: '', vatCodeKey: '' }));
  const rebate = Number(legacy['rebate'] ?? 0);
  const rebateReason = String(legacy['rebateReason'] ?? '');
  if (rebate !== 0 || rebateReason.length > 0) {
    positions.push({ key: 'rebate', usage: 'other', type: 'rebate',
      label: rebateReason || 'Rabatt', amount: rebate,
      accountKey: '', vatCodeKey: '' });
  }
  return positions;
}

/**
 * One-time, idempotent migration of the eight legacy fee columns (jb/srv/bev/entryFee/locker/
 * hallenTraining/skiff/skiffInsurance) plus rebate/rebateReason into `positions[]`. Admin-only.
 * Safe to re-run: a document whose `positions` is already non-empty is skipped outright, so a
 * partial or repeated run can never double-convert or clobber a hand-corrected document. The
 * write of `positions` and the deletion of the ten legacy fields happen in a single `update`
 * call per document, so a document is never left in a half-migrated state between the two shapes.
 */
export const migrateMemberFees = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540 },
  async (request): Promise<FsData> => {
    checkAppCheckToken(request, 'migrateMemberFees');
    checkAuthentication(request, 'migrateMemberFees');
    await checkAdminRole(request, 'migrateMemberFees');

    const db = getFirestore();
    const del = FieldValue.delete();
    const result = { seen: 0, converted: 0, skipped: 0 };

    result.seen = await forEachDoc(db.collection(MemberFeeCollection), async (id, data) => {
      if (Array.isArray(data.positions) && data.positions.length > 0) {
        result.skipped++;
        return;
      }
      const positions = toPositions(data);
      await db.collection(MemberFeeCollection).doc(id).update({
        positions,
        jb: del,
        srv: del,
        bev: del,
        entryFee: del,
        locker: del,
        hallenTraining: del,
        skiff: del,
        skiffInsurance: del,
        rebate: del,
        rebateReason: del,
      });
      result.converted++;
    });

    logger.info('migrateMemberFees: done', result);
    return result;
  },
);
