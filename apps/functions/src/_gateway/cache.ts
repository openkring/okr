// apps/functions/src/_gateway/cache.ts
//
// Single `apiCache` collection sitting in FRONT of the provider call (not in
// front of any domain model). Doc id = cacheKey(...). Admin-SDK only; client
// access is denied in firestore.rules. Rows carry `expiresAt` for a native
// Firestore TTL policy — no custom sweep. Cache-write must never fail the request.

import { getFirestore, Timestamp, FieldPath } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import type { CacheScope, GatewayContext } from './provider';
import { cacheKeyPrefix } from './cache-key';

const COLLECTION = 'apiCache';

/** Firestore caps a write batch at 500 operations. */
const DELETE_BATCH = 500;

export interface CacheEntry<R> {
  raw: R;
  sourceTimestamp: string | null;
  etag: string | null;
  storedAtMs: number;
  expiresAtMs: number;
}

/** Pure: an entry is expired once now has reached its expiry. */
export function isExpired(entry: { expiresAtMs: number }, nowMs: number): boolean {
  return nowMs >= entry.expiresAtMs;
}

export async function readCache<R>(key: string): Promise<CacheEntry<R> | null> {
  try {
    const snap = await getFirestore().collection(COLLECTION).doc(key).get();
    if (!snap.exists) return null;
    const d = snap.data() as Record<string, unknown>;
    return {
      raw: d['raw'] as R,
      sourceTimestamp: (d['sourceTimestamp'] as string | null) ?? null,
      etag: (d['etag'] as string | null) ?? null,
      storedAtMs: (d['storedAt'] as Timestamp).toMillis(),
      expiresAtMs: (d['expiresAt'] as Timestamp).toMillis(),
    };
  } catch (err) {
    // A cache read must never break the request — fall through to a live fetch.
    logger.warn('apiCache read failed', { key, message: (err as Error).message });
    return null;
  }
}

export async function writeCache<R>(
  key: string,
  providerId: string,
  scope: string,
  entry: CacheEntry<R>,
): Promise<void> {
  try {
    await getFirestore().collection(COLLECTION).doc(key).set({
      providerId,
      scope,
      raw: entry.raw,
      sourceTimestamp: entry.sourceTimestamp,
      etag: entry.etag,
      storedAt: Timestamp.fromMillis(entry.storedAtMs),
      expiresAt: Timestamp.fromMillis(entry.expiresAtMs),
    });
  } catch (err) {
    // Fail-soft: log and serve. A cache-write failure must not fail the request.
    logger.warn('apiCache write failed', { key, message: (err as Error).message });
  }
}

/**
 * Exclusive upper bound for a document-id prefix range: the prefix with its last
 * character bumped to the next code unit. Exact, unlike the `''` sentinel
 * commonly used for this, which merely assumes no id contains a higher char.
 */
export function prefixUpperBound(prefix: string): string {
  if (prefix.length === 0) return '';
  const last = prefix.charCodeAt(prefix.length - 1);
  return prefix.slice(0, -1) + String.fromCharCode(last + 1);
}

/**
 * Drop every cached entry for one provider within one scope — the read-through
 * cache's missing half. A provider that is only ever read can rely on TTL alone;
 * one whose data WE also mutate (srv: create/update a member) must be able to
 * invalidate, or an admin's own edit stays invisible until the TTL lapses.
 *
 * Deletes by document-id RANGE over `cacheKeyPrefix(...)`, so no field query, no
 * composite index and no schema change: the scope and tenant are already encoded
 * in the id by the writer. Both bounds come from the same helper the writer uses.
 *
 * Fail-soft but LOUD. It runs after the upstream write has already succeeded, so
 * throwing would report a failure for work that was done; but a silent miss means
 * stale data, which is the bug this exists to prevent — hence `logger.error`.
 * Returns the number of documents deleted (0 on failure).
 */
export async function invalidateProvider(
  providerId: string,
  scope: CacheScope,
  ctx: Pick<GatewayContext, 'tenantId' | 'uid'>,
): Promise<number> {
  const prefix = cacheKeyPrefix(providerId, scope, ctx);
  let deleted = 0;
  try {
    const db = getFirestore();
    // Loop: one provider can hold more entries than a single batch allows.
    for (;;) {
      const snap = await db
        .collection(COLLECTION)
        .where(FieldPath.documentId(), '>=', prefix)
        .where(FieldPath.documentId(), '<', prefixUpperBound(prefix))
        .limit(DELETE_BATCH)
        .get();
      if (snap.empty) break;
      const batch = db.batch();
      for (const doc of snap.docs) batch.delete(doc.ref);
      await batch.commit();
      deleted += snap.size;
      if (snap.size < DELETE_BATCH) break;
    }
    logger.info('apiCache invalidated', { providerId, scope, deleted });
    return deleted;
  } catch (err) {
    logger.error('apiCache invalidation FAILED — entries stay stale until TTL', {
      providerId,
      scope,
      deleted,
      message: (err as Error).message,
    });
    return 0;
  }
}
