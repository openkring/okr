// apps/functions/src/push-tokens/prune-stale-tokens.ts
//
// Morning job (spec 1.127 phase 2, task 7): delete push tokens of dead devices, together with
// their Matrix pushers, so dead devices stop receiving (and failing) chat and app pushes.
//
// `users/{uid}/fcmTokens/{docId}` = `{ token, updatedAt }`. A web start refreshes updatedAt, but a
// native start may not (N4: the registration listener is attached after register(), and iOS does
// not retain the event) until phase 3.4 — so an old updatedAt alone does NOT prove a dead device.
// Hence (final-review ruling I1):
//
// - older than PUSH_TOKEN_MAX_AGE_DAYS (60): deleted only when an FCM validate-only send says the
//   token is unregistered or invalid;
// - older than PUSH_TOKEN_HARD_MAX_AGE_DAYS (270, FCM's own inactivity expiry): deleted regardless.
//
// A person who is a member of several tenants has one users/{uid} per tenant but ONE Matrix
// account, shared by all their apps: pushers are removed by exact pushkey only, so another
// device's (or another tenant app's) pusher is never touched.

import { logger } from 'firebase-functions/v2';
import { getFirestore, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

import { removeMatrixPushers } from '../matrix-simple/push';

export const PUSH_TOKEN_MAX_AGE_DAYS = 60;
/** FCM expires a token after 270 days of inactivity; an older doc is deleted without asking FCM. */
export const PUSH_TOKEN_HARD_MAX_AGE_DAYS = 270;
/** Docs read per run — keeps the job's footprint small inside the shared 256MiB morning slot. */
const PRUNE_LIMIT = 500;
/** Validate-only sends running at once (small batches: no burst against the FCM quota). */
const VALIDATE_BATCH = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What a validate-only FCM send says about a token: `error` = no verdict (network, quota, …). */
export type TokenValidation = 'valid' | 'invalid' | 'error';

/** FCM error codes that prove a token can never be delivered to again. */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  // A malformed token string: FCM rejects it as an invalid argument.
  'messaging/invalid-argument',
]);

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

/** Only a token between the two limits needs FCM's verdict; younger ones are kept, older ones deleted. */
export function needsValidation(ageDays: number): boolean {
  return ageDays >= PUSH_TOKEN_MAX_AGE_DAYS && ageDays < PUSH_TOKEN_HARD_MAX_AGE_DAYS;
}

/**
 * The prune rule. Pure. At or past the hard limit: delete regardless. Past the soft limit: delete
 * only a token FCM reported dead — a still-valid token and a failed check (`error`) are kept.
 * Younger tokens are always kept, whatever `validation` says.
 */
export function pruneDecision(ageDays: number, validation?: TokenValidation): 'delete' | 'keep' {
  if (ageDays >= PUSH_TOKEN_HARD_MAX_AGE_DAYS) return 'delete';
  if (ageDays >= PUSH_TOKEN_MAX_AGE_DAYS && validation === 'invalid') return 'delete';
  return 'keep';
}

/** Map a failed validate-only send to a verdict: only the dead-token codes mean `invalid`. */
export function classifySendError(err: unknown): TokenValidation {
  const code = (err as { code?: unknown } | null | undefined)?.code;
  return typeof code === 'string' && DEAD_TOKEN_CODES.has(code) ? 'invalid' : 'error';
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

/** Ask FCM about a token without delivering anything (dry run). An empty token is invalid. */
async function validateToken(token: string): Promise<TokenValidation> {
  if (!token) return 'invalid';
  try {
    await getMessaging().send({ token, data: { type: 'validate' } }, true);
    return 'valid';
  } catch (err) {
    return classifySendError(err);
  }
}

/**
 * The `pruneStalePushTokens` job of `morningJobs`. Reads at most PRUNE_LIMIT docs older than
 * PUSH_TOKEN_MAX_AGE_DAYS, decides per doc ({@link pruneDecision}; the ones inside the window are
 * validated in small batches), deletes each doc with a `lastUpdateTime` precondition — a device
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
  for (let i = 0; i < candidates.length; i += VALIDATE_BATCH) {
    const chunk = candidates.slice(i, i + VALIDATE_BATCH);
    const decisions = await Promise.all(chunk.map(async ({ row }) => {
      const age = tokenAgeDays(row.updatedAtMs, nowMs);
      const validation = needsValidation(age) ? await validateToken(row.token) : undefined;
      return pruneDecision(age, validation);
    }));
    chunk.forEach((candidate, j) => {
      if (decisions[j] === 'delete') toDelete.push(candidate);
      else kept++;
    });
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
