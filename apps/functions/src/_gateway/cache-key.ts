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
 * Cache document id: `{providerId}:{scopePrefix}{hash(params)}`.
 * Scope is folded into the KEY so isolation cannot be forgotten downstream:
 *  - shared → one entry serves everyone
 *  - tenant → `t:{tenantId}:` prefix
 *  - user   → `u:{uid}:` prefix
 */
export function cacheKey(
  providerId: string,
  scope: CacheScope,
  ctx: GatewayContext,
  params: unknown,
): string {
  const hash = createHash('sha256').update(stableStringify(params)).digest('hex').slice(0, 32);
  const prefix =
    scope === 'tenant' ? `t:${ctx.tenantId}:` : scope === 'user' ? `u:${ctx.uid ?? 'anon'}:` : '';
  return `${providerId}:${prefix}${hash}`;
}
