// apps/functions/src/_gateway/gateway.ts
//
// The orchestrator. One flow for every read-through provider:
//   window-quota → cache-read(fresh?) → monthly-cap(breach? serve stale/fail) →
//   fetch → increment usage → cache-write(fail-soft) → map → wrap.
// makeGatewayCallable() turns an adapter into an onCall with the right region,
// AppCheck, secrets and error mapping.

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { tenantIdOfUserData } from '@okr/shared-util-functions';
import type { ProviderAdapter, GatewayContext, GatewayResult, CacheScope } from './provider';
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

/** Reads `users/{uid}.tenants[0]`. Seam so the callable is testable without Firestore. */
async function readUserTenantId(uid: string): Promise<string> {
  const snap = await getFirestore().collection('users').doc(uid).get();
  return tenantIdOfUserData(snap.data());
}

/**
 * The caller's tenant — always derived server-side from `users/{uid}.tenants[0]`,
 * never from `request.data`. A client can put any string in the payload, so
 * trusting it would let one tenant read or poison another tenant's cache
 * partition (`t:{tenantId}:` prefix) and skew its quota bucket.
 *
 * Anonymous callers (only reachable on a `requiresAuth: false` adapter) and
 * users not linked to a tenant resolve to `''`. That is fine for a
 * `scope: 'shared'` or `scope: 'user'` adapter — neither folds tenantId into the
 * cache key — but a `scope: 'tenant'` adapter is rejected rather than served
 * from an unscoped `t::` partition shared by every unresolved caller.
 *
 * Cost: one Firestore document read per authenticated gateway call, on top of
 * the quota/cache reads the flow already does.
 */
export async function resolveTenantId(
  uid: string | null,
  scope: CacheScope,
  readTenantId: (uid: string) => Promise<string> = readUserTenantId,
): Promise<string> {
  const tenantId = uid ? await readTenantId(uid) : '';
  if (tenantId === '' && scope === 'tenant') {
    logger.error('gateway: tenant-scoped provider called without a resolvable tenant', { uid });
    throw new HttpsError('failed-precondition', 'User is not linked to a tenant.');
  }
  return tenantId;
}

/**
 * Drop a client-supplied `tenantId` from the call params. It is not input any
 * more (see resolveTenantId), and leaving it in would fragment the shared cache
 * — `cacheKey` hashes the params, so the same query sent with a different
 * `tenantId` would miss the cache and burn a fresh upstream call.
 */
export function stripTenantId<P>(data: P): P {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (!('tenantId' in (data as Record<string, unknown>))) return data;
  const rest = { ...(data as Record<string, unknown>) };
  delete rest['tenantId'];
  return rest as P;
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
      const uid = request.auth?.uid ?? null;
      const ctx: GatewayContext = {
        tenantId: await resolveTenantId(uid, adapter.scope),
        uid,
        isAdmin: token?.['admin'] === true || token?.['contentAdmin'] === true,
      };
      return runGateway(adapter, stripTenantId(request.data), ctx);
    },
  );
}
