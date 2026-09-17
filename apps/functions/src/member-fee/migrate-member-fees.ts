import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Query, DocumentData } from 'firebase-admin/firestore';

import { LegacyMemberFeeCollection, MemberFeeCollection, MemberFeePosition } from '@okr/shared-models';
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
 * The ten fields the legacy shape carried instead of `positions[]`. They are dropped on copy —
 * `toPositions` has already turned them into positions.
 */
export const LEGACY_FEE_FIELDS = [
  'jb', 'srv', 'bev', 'entryFee', 'locker', 'hallenTraining', 'skiff', 'skiffInsurance',
  'rebate', 'rebateReason',
] as const;

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
 * Build the migrated document from one legacy document: every field carries over unchanged
 * except the ten legacy fee columns, which `toPositions` has turned into `positions[]`.
 */
export function toMigratedDoc(legacy: FsData): FsData {
  const copy: FsData = { ...legacy };
  for (const field of LEGACY_FEE_FIELDS) delete copy[field];
  copy.positions = toPositions(legacy);
  return copy;
}

/**
 * The three Firestore operations the copy needs, so the loop below can be exercised without a
 * database. The callable supplies the real admin-SDK implementations.
 */
export interface MigrationGateway {
  /** Run `fn` over every legacy document; returns how many were seen. */
  eachLegacy(fn: (id: string, data: FsData) => Promise<void>): Promise<number>;
  targetExists(id: string): Promise<boolean>;
  writeTarget(id: string, data: FsData): Promise<void>;
}

export interface MigrationResult { seen: number; converted: number; skipped: number }

/**
 * Copy every legacy document into the new collection UNDER THE SAME ID, converting its fee
 * columns on the way. Idempotent: a legacy document whose target id already exists is skipped,
 * never overwritten. The legacy document is left untouched.
 */
export async function migrateLegacyDocs(gw: MigrationGateway): Promise<MigrationResult> {
  const result: MigrationResult = { seen: 0, converted: 0, skipped: 0 };
  result.seen = await gw.eachLegacy(async (id, data) => {
    if (await gw.targetExists(id)) {
      result.skipped++;
      return;
    }
    await gw.writeTarget(id, toMigratedDoc(data));
    result.converted++;
  });
  return result;
}

/**
 * One-time, idempotent migration out of the legacy `scs-memberfees` collection into
 * `member-fees`, converting the eight legacy fee columns (jb/srv/bev/entryFee/locker/
 * hallenTraining/skiff/skiffInsurance) plus rebate/rebateReason into `positions[]`. Admin-only.
 *
 * READS `LegacyMemberFeeCollection`, WRITES `MemberFeeCollection` under the SAME document id, so
 * every link, activity entry and invoice reference into a fee row survives the move.
 *
 * Safe to re-run: a legacy document whose target id already exists in `member-fees` is skipped
 * outright, so a partial or repeated run can never double-convert or clobber a hand-corrected
 * document. The legacy document is deliberately NOT deleted — the owner drops the old collection
 * once satisfied. Until then both copies exist, which keeps a rollback possible and is why
 * `scs-memberfees` still has a SUBJECT_DATA_MAP row, a privacy-report label and a rules block.
 */
export const migrateMemberFees = onCall(
  { region: REGION, enforceAppCheck: true, timeoutSeconds: 540 },
  async (request): Promise<FsData> => {
    checkAppCheckToken(request, 'migrateMemberFees');
    checkAuthentication(request, 'migrateMemberFees');
    await checkAdminRole(request, 'migrateMemberFees');

    const db = getFirestore();
    const target = (id: string) => db.collection(MemberFeeCollection).doc(id);

    const result = await migrateLegacyDocs({
      eachLegacy: (fn) => forEachDoc(db.collection(LegacyMemberFeeCollection), fn),
      targetExists: async (id) => (await target(id).get()).exists,
      writeTarget: async (id, data) => { await target(id).set(data); },
    });

    logger.info('migrateMemberFees: done', result);
    return result;
  },
);
