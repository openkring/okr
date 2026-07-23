// apps/functions/src/_gateway/cache.ts
//
// Single `apiCache` collection sitting in FRONT of the provider call (not in
// front of any domain model). Doc id = cacheKey(...). Admin-SDK only; client
// access is denied in firestore.rules. Rows carry `expiresAt` for a native
// Firestore TTL policy — no custom sweep. Cache-write must never fail the request.

import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

const COLLECTION = 'apiCache';

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
