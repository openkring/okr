// apps/functions/src/push-tokens/prune-stale-tokens.ts
//
// Morning job (spec 1.127 phase 2, task 7): delete push tokens no app start has refreshed for
// PUSH_TOKEN_MAX_AGE_DAYS, together with their Matrix pushers, so dead devices stop receiving
// (and failing) chat and app pushes.
//
// `users/{uid}/fcmTokens/{docId}` = `{ token, updatedAt }`; every app start refreshes updatedAt.
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

/**
 * Group the stale rows by account uid. A row is stale when it is older than `maxAgeDays` or
 * has no `updatedAt`. Pure; rows of different uids never mix.
 */
export function groupStaleTokens(
  rows: PushTokenRow[],
  nowMs: number,
  maxAgeDays: number
): Map<string, { docId: string; token: string }[]> {
  const cutoffMs = nowMs - maxAgeDays * DAY_MS;
  const groups = new Map<string, { docId: string; token: string }[]>();
  for (const row of rows) {
    if (row.updatedAtMs !== null && row.updatedAtMs >= cutoffMs) continue;
    const list = groups.get(row.uid) ?? [];
    list.push({ docId: row.docId, token: row.token });
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
 * The `pruneStalePushTokens` job of `morningJobs`. Per account: remove the stale tokens' Matrix
 * pushers (a uid without a Matrix account or a Synapse failure is logged, the docs are deleted
 * anyway), then delete the token docs. At most PRUNE_LIMIT docs per run; the rest follow the
 * next mornings. Docs without `updatedAt` are not matched by the range query (Firestore skips
 * a missing field); they are not written by any current client.
 */
export async function runPruneStalePushTokens(): Promise<{ users: number; tokens: number; pushers: number }> {
  const db = getFirestore();
  const nowMs = Date.now();
  const cutoff = Timestamp.fromMillis(nowMs - PUSH_TOKEN_MAX_AGE_DAYS * DAY_MS);
  const snap = await db.collectionGroup('fcmTokens').where('updatedAt', '<', cutoff).limit(PRUNE_LIMIT).get();

  const rows = snap.docs.map(toRow).filter((r): r is PushTokenRow => r !== undefined);
  const groups = groupStaleTokens(rows, nowMs, PUSH_TOKEN_MAX_AGE_DAYS);

  let tokens = 0;
  let pushers = 0;
  for (const [uid, stale] of groups) {
    const pushkeys = stale.map((s) => s.token).filter(Boolean);
    try {
      pushers += await removeMatrixPushers(uid, pushkeys, 'pruneStalePushTokens');
    } catch (err) {
      logger.warn(`pruneStalePushTokens: Matrix pushers of ${uid} not removed (tokens are deleted anyway)`, err);
    }
    const batch = db.batch();
    for (const { docId } of stale) {
      batch.delete(db.collection('users').doc(uid).collection('fcmTokens').doc(docId));
    }
    try {
      await batch.commit();
      tokens += stale.length;
    } catch (err) {
      logger.error(`pruneStalePushTokens: deleting ${stale.length} token doc(s) of ${uid} failed`, err);
    }
  }

  const result = { users: groups.size, tokens, pushers };
  logger.info(`pruneStalePushTokens: users=${result.users} tokens=${result.tokens} pushers=${result.pushers}`);
  return result;
}
