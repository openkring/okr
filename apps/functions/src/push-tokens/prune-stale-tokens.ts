// apps/functions/src/push-tokens/prune-stale-tokens.ts
//
// Morning job (spec 1.127 phase 2, task 7): delete push tokens of dead devices, together with
// their Matrix pushers, so dead devices stop receiving (and failing) chat and app pushes.
//
// `users/{uid}/fcmTokens/{docId}` = `{ token, updatedAt, platform? }`. Every app start refreshes
// updatedAt — web and, since phase 3 (N4), native too — so a token not refreshed for
// PUSH_TOKEN_MAX_AGE_DAYS (60) belongs to a device that has not opened the app since: deleted on age
// alone (decided 2026-10-31; phase 2 asked FCM first and kept valid tokens up to 270 days, which
// was only needed while native starts could skip the refresh).
//
// A person who is a member of several tenants has one users/{uid} per tenant but ONE Matrix
// account, shared by all their apps: pushers are removed by exact pushkey only, so another
// device's (or another tenant app's) pusher is never touched.

import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

import { removeMatrixPushers } from '../matrix-simple/push';

export const PUSH_TOKEN_MAX_AGE_DAYS = 60;
/** Docs read per run — keeps the job's footprint small inside the shared 256MiB morning slot. */
const PRUNE_LIMIT = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PushTokenRow {
  uid: string;
  docId: string;
  token: string;
  updatedAtMs: number | null;
}

/** Whole days since `updatedAtMs`; a missing `updatedAt` counts as infinitely old. */
export function tokenAgeDays(updatedAtMs: number | null, nowMs: number): number {
  if (updatedAtMs === null) return Number.POSITIVE_INFINITY;
  return Math.floor((nowMs - updatedAtMs) / DAY_MS);
}

/** The prune rule. Pure. A token not refreshed for PUSH_TOKEN_MAX_AGE_DAYS (or never) is deleted. */
export function pruneDecision(ageDays: number): 'delete' | 'keep' {
  return ageDays >= PUSH_TOKEN_MAX_AGE_DAYS ? 'delete' : 'keep';
}

/** Group rows by account uid, keeping each account's tokens apart. Pure. */
export function groupByUid<T extends { uid: string }>(rows: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const list = groups.get(row.uid) ?? [];
    list.push(row);
    groups.set(row.uid, list);
  }
  return groups;
}

function toRow(doc: QueryDocumentSnapshot): PushTokenRow | undefined {
  // users/{uid}/fcmTokens/{docId}: the parent doc may be missing (orphaned subcollection),
  // its id is still the uid.
  const userRef = doc.ref.parent.parent;
  if (!userRef || userRef.parent.id !== 'users') return undefined;
  const uid = userRef.id;
  const data = doc.data();
  const updatedAt = data['updatedAt'];
  return {
    uid,
    docId: doc.id,
    token: typeof data['token'] === 'string' ? data['token'] : '',
    updatedAtMs: updatedAt instanceof Timestamp ? updatedAt.toMillis() : null,
  };
}

/**
 * The `pruneStalePushTokens` job of `morningJobs`. Reads at most PRUNE_LIMIT docs older than
 * PUSH_TOKEN_MAX_AGE_DAYS ({@link pruneDecision}), deletes each doc with a `lastUpdateTime` precondition — a device
 * that refreshed its token meanwhile keeps it — and then removes the Matrix pushers of exactly the
 * tokens whose doc was deleted. A uid without a Matrix account or a Synapse failure is logged.
 * Docs without `updatedAt` are not matched by the range query (Firestore skips a missing field);
 * no current client writes them.
 */
export async function runPruneStalePushTokens(): Promise<{ users: number; tokens: number; pushers: number; kept: number }> {
  const db = getFirestore();
  const nowMs = Date.now();
  const cutoff = Timestamp.fromMillis(nowMs - PUSH_TOKEN_MAX_AGE_DAYS * DAY_MS);
  const snap = await db.collectionGroup('fcmTokens').where('updatedAt', '<', cutoff).limit(PRUNE_LIMIT).get();

  const candidates: { doc: QueryDocumentSnapshot; row: PushTokenRow }[] = [];
  for (const doc of snap.docs) {
    const row = toRow(doc);
    if (row) candidates.push({ doc, row });
  }

  const toDelete: { doc: QueryDocumentSnapshot; row: PushTokenRow }[] = [];
  let kept = 0;
  for (const candidate of candidates) {
    if (pruneDecision(tokenAgeDays(candidate.row.updatedAtMs, nowMs)) === 'delete') toDelete.push(candidate);
    else kept++;
  }

  // Per doc, not one batch: a failed precondition (refreshed meanwhile) must not block the others.
  const deleted: PushTokenRow[] = [];
  for (const { doc, row } of toDelete) {
    try {
      await doc.ref.delete({ lastUpdateTime: doc.updateTime });
      deleted.push(row);
    } catch (err) {
      logger.info(`pruneStalePushTokens: token doc ${row.docId} of ${row.uid} kept (changed meanwhile or delete failed)`, err);
      kept++;
    }
  }

  const groups = groupByUid(deleted);
  let pushers = 0;
  for (const [uid, rows] of groups) {
    const pushkeys = rows.map((r) => r.token).filter(Boolean);
    try {
      pushers += await removeMatrixPushers(uid, pushkeys, 'pruneStalePushTokens');
    } catch (err) {
      logger.warn(`pruneStalePushTokens: Matrix pushers of ${uid} not removed (their token docs are deleted)`, err);
    }
  }

  const result = { users: groups.size, tokens: deleted.length, pushers, kept };
  logger.info(`pruneStalePushTokens: users=${result.users} tokens=${result.tokens} pushers=${result.pushers} kept=${result.kept}`);
  return result;
}
