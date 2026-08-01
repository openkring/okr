// apps/functions/src/_gateway/cache-key.ts
import { createHash } from 'crypto';
import type { CacheScope, GatewayContext } from './provider';

/** Deterministic JSON: object keys sorted recursively so key order never
 *  changes the hash. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(',')}}`;
}

/**
 * Everything in a cache document id that precedes the params hash:
 * `{providerId}:{scopePrefix}`. Scope is folded in so isolation cannot be
 * forgotten downstream:
 *  - shared → one entry serves everyone
 *  - tenant → `t:{tenantId}:` prefix
 *  - user   → `u:{uid}:` prefix
 *
 * Split out from `cacheKey` because `invalidateProvider` deletes by document-id
 * RANGE over exactly this prefix. Building that range independently would let it
 * drift from the writer and silently delete nothing — so both callers derive it
 * here.
 */
export function cacheKeyPrefix(
  providerId: string,
  scope: CacheScope,
  ctx: Pick<GatewayContext, 'tenantId' | 'uid'>,
): string {
  const scopePrefix =
    scope === 'tenant' ? `t:${ctx.tenantId}:` : scope === 'user' ? `u:${ctx.uid ?? 'anon'}:` : '';
  return `${providerId}:${scopePrefix}`;
}

/** Cache document id: `{providerId}:{scopePrefix}{hash(params)}`. */
export function cacheKey(
  providerId: string,
  scope: CacheScope,
  ctx: GatewayContext,
  params: unknown,
): string {
  const hash = createHash('sha256').update(stableStringify(params)).digest('hex').slice(0, 32);
  return `${cacheKeyPrefix(providerId, scope, ctx)}${hash}`;
}
