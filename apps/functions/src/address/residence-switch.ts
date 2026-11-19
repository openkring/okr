/**
 * Spec 1.164 §5.2 / §6.3: the nightly job that makes an announced move's new address the favorite
 * on its moving date. Letters, invoices and the vCard read the favorite postal row, so the switch
 * has to follow the dates. `planSwitch` is the pure decision; `runResidenceSwitch` loads and writes.
 */
import { Firestore, getFirestore, Timestamp, WriteBatch } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import { DEFAULT_ADDRESS_USAGE } from '@okr/shared-constants';
import { AddressCollection, AddressModel } from '@okr/shared-models';
import { addDuration, isPostalResidence, residenceStatus } from '@okr/shared-util-core';

import { zurichStoreDate } from '../video/chat-video.util';

const MAX_BATCH_WRITES = 400;

export interface SwitchPlan {
  /** the row that becomes the favorite postal row */
  promote: string | undefined;
  /** favorite postal rows that lose the flag */
  demote: string[];
}

const usageOf = (r: AddressModel): string => r.addressUsage || DEFAULT_ADDRESS_USAGE;
const byOkey = (a: AddressModel, b: AddressModel): number => a.okey.localeCompare(b.okey);

/**
 * One parent's rows → what to flip. One favorite postal row per parent, whatever its usage.
 * - a current favorite stays; every OTHER favorite postal row is demoted;
 * - no favorite → nothing (a favorite is never invented);
 * - only a past favorite (the move date passed, also after a missed night) → the current row of the
 *   SAME addressUsage takes over (its successor, the row starting the day after the favorite ended,
 *   else the one that started last), and every other favorite is demoted;
 * - no such row (the move was never recorded) → nothing: the old address stays the favorite;
 * - a future favorite is only demoted while a current favorite exists.
 */
export function planSwitch(rows: AddressModel[], today: string): SwitchPlan {
  const postal = rows.filter(isPostalResidence);
  const favs = postal.filter((r) => r.isFavorite);
  if (favs.length === 0) return { promote: undefined, demote: [] };

  const currentFavs = favs.filter((r) => residenceStatus(r, today) === 'current').sort(byOkey);
  if (currentFavs.length > 0) {
    return { promote: undefined, demote: favs.filter((r) => r !== currentFavs[0]).map((r) => r.okey) };
  }

  const pastFavs = favs.filter((r) => residenceStatus(r, today) === 'past').sort((a, b) => (b.validTo ?? '').localeCompare(a.validTo ?? '') || byOkey(a, b));
  const old = pastFavs[0] as AddressModel | undefined;
  if (!old) return { promote: undefined, demote: [] }; // only future favorites: leave them
  const successorFrom = addDuration(old.validTo ?? '', { days: 1 });
  const candidates = postal.filter((r) => !r.isFavorite && usageOf(r) === usageOf(old) && residenceStatus(r, today) === 'current');
  const next =
    candidates.filter((r) => r.validFrom === successorFrom).sort(byOkey)[0] ??
    [...candidates].sort((a, b) => (b.validFrom ?? '').localeCompare(a.validFrom ?? '') || byOkey(a, b))[0];
  if (!next) return { promote: undefined, demote: [] };
  return { promote: next.okey, demote: favs.map((r) => r.okey) };
}

/**
 * Packs per-parent write groups into batches of at most `max` writes. A group is never split: a
 * parent's promote and demote commit together or not at all, so a failed batch cannot leave a
 * parent without a favorite. A single group larger than `max` gets a batch of its own.
 */
export function packGroups<T>(groups: T[][], max: number): T[][] {
  const chunks: T[][] = [];
  let cur: T[] = [];
  for (const g of groups) {
    if (cur.length > 0 && cur.length + g.length > max) {
      chunks.push(cur);
      cur = [];
    }
    cur = cur.concat(g);
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks;
}

interface Write { ref: FirebaseFirestore.DocumentReference; patch: { isFavorite: boolean }; readAt: Timestamp }

/** The nightly job: favorites whose residence ended before today → planSwitch per parent. */
export async function runResidenceSwitch(now: Date): Promise<void> {
  const db: Firestore = getFirestore();
  const today = zurichStoreDate(now);
  const col = db.collection(AddressCollection);

  // validTo '' (open) sorts before any date: the lower bound leaves it out
  const stale = await col
    .where('addressChannel', '==', 'postal')
    .where('isFavorite', '==', true)
    .where('validTo', '>', '')
    .where('validTo', '<', today)
    .get();
  const parents = [...new Set(stale.docs.filter((d) => !d.data()['isArchived']).map((d) => d.data()['parentKey'] as string).filter(Boolean))];

  const groups: Write[][] = [];
  for (const parentKey of parents) {
    const snap = await col.where('parentKey', '==', parentKey).get();
    const rows = snap.docs.map((d) => ({ ...d.data(), okey: d.id }) as AddressModel);
    const times = new Map(snap.docs.map((d) => [d.id, d.updateTime]));
    const plan = planSwitch(rows, today);
    if (!plan.promote && plan.demote.length === 0) logger.warn(`residenceSwitch: ${parentKey} has a past favorite but no current row to take over`);
    const group: Write[] = [];
    if (plan.promote) group.push({ ref: col.doc(plan.promote), patch: { isFavorite: true }, readAt: times.get(plan.promote) as Timestamp });
    for (const okey of plan.demote) group.push({ ref: col.doc(okey), patch: { isFavorite: false }, readAt: times.get(okey) as Timestamp });
    if (group.length > 0) groups.push(group);
  }

  let switched = 0;
  for (const chunk of packGroups(groups, MAX_BATCH_WRITES)) {
    const batch: WriteBatch = db.batch();
    for (const w of chunk) batch.update(w.ref, w.patch, { lastUpdateTime: w.readAt });
    try {
      await batch.commit();
      switched += chunk.length;
    } catch (err) {
      // a row changed since it was read (or a transient error): tonight's chunk is skipped as a whole, tomorrow's run plans again
      logger.error('residenceSwitch: batch failed', err);
    }
  }
  logger.info(`residenceSwitch: ${parents.length} parent(s), ${switched} write(s)`);
}
