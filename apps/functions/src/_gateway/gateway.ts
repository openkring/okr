// apps/functions/src/_gateway/gateway.ts
//
// The orchestrator. One flow for every read-through provider:
//   window-quota → cache-read(fresh?) → monthly-cap(breach? serve stale/fail) →
//   fetch → increment usage → cache-write(fail-soft) → map → wrap.
// makeGatewayCallable() turns an adapter into an onCall with the right region,
// AppCheck, secrets and error mapping.

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import type { ProviderAdapter, GatewayContext, GatewayResult } from './provider';
import { cacheKey } from './cache-key';
import { readCache, writeCache, isExpired, CacheEntry } from './cache';
import { checkWindowQuota, getMonthlyCount, incrementMonthlyCount } from './quota';

/** Injectable seams so the flow is unit-testable without Firestore/network. */
export interface GatewayDeps {
  checkWindowQuota: typeof checkWindowQuota;
  readCache: <R>(key: string) => Promise<CacheEntry<R> | null>;
  writeCache: <R>(key: string, providerId: string, scope: string, entry: CacheEntry<R>) => Promise<void>;
  getMonthlyCount: typeof getMonthlyCount;
  incrementMonthlyCount: typeof incrementMonthlyCount;
  now: () => number;
}

const realDeps: GatewayDeps = {
  checkWindowQuota,
  readCache,
  writeCache,
  getMonthlyCount,
  incrementMonthlyCount,
  now: () => Date.now(),
};

export async function runGateway<P, R, M>(
  adapter: ProviderAdapter<P, R, M>,
  params: P,
  ctx: GatewayContext,
  deps: GatewayDeps = realDeps,
): Promise<GatewayResult<M>> {
  const nowMs = deps.now();
  const key = cacheKey(adapter.id, adapter.scope, ctx, params);

  // 1. Per-caller window (throws resource-exhausted if exceeded).
  await deps.checkWindowQuota(adapter.id, ctx, adapter.windowLimit);

  const wrap = (raw: R, cached: boolean, stale?: boolean): GatewayResult<M> => ({
    data: adapter.map(raw, params),
    attribution: adapter.attribution,
    sourceTimestamp: adapter.sourceTimestamp(raw),
    cached,
    ...(stale ? { stale: true } : {}),
  });

  // 2. Fresh cache hit → serve without touching the provider or the monthly cap.
  const cached = await deps.readCache<R>(key);
  if (cached && !isExpired(cached, nowMs)) {
    return wrap(cached.raw, true);
  }

  // 3. Monthly cap: on breach, serve stale cache if any, else fail soft.
  if (adapter.monthlyCap !== undefined) {
    const used = await deps.getMonthlyCount(adapter.id, nowMs);
    if (used >= adapter.monthlyCap) {
      if (cached) {
        logger.warn('gateway: monthly cap hit, serving stale cache', { provider: adapter.id, used });
        return wrap(cached.raw, true, true);
      }
      throw new HttpsError(
        'resource-exhausted',
        `Monthly cap reached for ${adapter.id}. Try again next month.`,
      );
    }
  }

  // 4. Live fetch (adapter.fetch throws on transport error; map to HttpsError).
  let raw: R;
  try {
    raw = await adapter.fetch(params, ctx);
  } catch (err: unknown) {
    if (err instanceof HttpsError) throw err;
    logger.error('gateway: upstream fetch failed', {
      provider: adapter.id,
      message: err instanceof Error ? err.message : String(err),
    });
    // Stale-if-error: prefer serving something over failing hard.
    if (cached) return wrap(cached.raw, true, true);
    throw new HttpsError('unavailable', `${adapter.attribution.provider} request failed`);
  }

  // 5. Record usage + write cache (both fail-soft), then map + wrap.
  await deps.incrementMonthlyCount(adapter.id, nowMs);
  const entry: CacheEntry<R> = {
    raw,
    sourceTimestamp: adapter.sourceTimestamp(raw),
    etag: null,
    storedAtMs: nowMs,
    expiresAtMs: nowMs + adapter.ttlSeconds * 1000,
  };
  await deps.writeCache(key, adapter.id, adapter.scope, entry);
  return wrap(raw, false);
}

/**
 * Turn an adapter into a callable. Resolves auth/tenant context, enforces
 * requiresAuth, binds region + AppCheck + declared secrets.
 */
export function makeGatewayCallable<P, R, M>(adapter: ProviderAdapter<P, R, M>) {
  return onCall(
    { region: 'europe-west6', enforceAppCheck: true, secrets: adapter.secrets },
    async (request: CallableRequest<P>): Promise<GatewayResult<M>> => {
      if (adapter.requiresAuth && !request.auth) {
        throw new HttpsError('unauthenticated', 'Authentication required');
      }
      const token = request.auth?.token as Record<string, unknown> | undefined;
      const ctx: GatewayContext = {
        // SECURITY — client-supplied tenantId. Safe ONLY while every adapter is
        // `scope: 'shared'` (tenantId never enters the cache key) and
        // `requiresAuth: true` (so the quota key uses uid, not this fallback).
        // Before adding any `scope: 'tenant'` or `scope: 'user'` adapter, derive
        // tenantId server-side from the auth token / user record — a client
        // could otherwise send another tenant's id and read/poison its cache
        // partition (cross-tenant leak). See spec PENDING §1.18.
        tenantId: (request.data as { tenantId?: string })?.tenantId ?? 'scs',
        uid: request.auth?.uid ?? null,
        isAdmin: token?.['admin'] === true || token?.['contentAdmin'] === true,
      };
      return runGateway(adapter, request.data, ctx);
    },
  );
}
