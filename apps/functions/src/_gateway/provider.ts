// apps/functions/src/_gateway/provider.ts
//
// The provider-adapter contract. An adapter declares WHAT a provider is, not HOW
// to call it. The gateway (gateway.ts) supplies retries, timeouts, error mapping,
// caching, quota, logging and attribution. Adapters MUST NOT import
// `firebase-functions` — they are plain data + two functions.

// NOTE: apps/functions pins firebase-functions@^6.3.2 (resolved 6.4.0), whose
// `firebase-functions/params` entry point imports SecretParam from './types'
// but does not re-export it — so the type is unreachable from the documented
// subpath in this installed version (it IS re-exported starting at 7.0.5,
// which the workspace root already uses). Importing straight from the lib's
// './types' module is the only way to name the type today; it still resolves
// under moduleResolution:"node" (package.json `exports` gates are not
// enforced) and the same path exists in 7.0.5, so this stays valid if/when
// apps/functions is bumped to match the root's firebase-functions version.
import type { SecretParam } from 'firebase-functions/lib/params/types';

/** Where a cache entry may be shared. Getting this wrong leaks data across
 *  tenants, so every adapter must declare it explicitly. */
export type CacheScope = 'shared' | 'tenant' | 'user';

/** What the UI must render for honesty + licence compliance. */
export interface Attribution {
  /** Human-readable provider name, e.g. "OECD". */
  provider: string;
  /** Link the UI must show. */
  url: string;
  /** Optional licence note, e.g. "OECD Terms & Conditions". */
  licence?: string;
  /** Optional disclaimer, e.g. "indikativ, keine Anlageberatung". */
  disclaimer?: string;
}

/** Per-caller sliding-window limit for a provider's callable. */
export interface WindowLimit {
  limit: number;
  windowMs: number;
}

/** Resolved request context handed to the adapter's fetch(). */
export interface GatewayContext {
  tenantId: string;
  uid: string | null;
  isAdmin: boolean;
}

/** What the client receives — mapped data plus honesty metadata. */
export interface GatewayResult<M> {
  data: M;
  attribution: Attribution;
  /** ISO timestamp of the upstream data, or null if the provider gives none. */
  sourceTimestamp: string | null;
  /** True when served from cache (fresh or stale). */
  cached: boolean;
  /** True when served from STALE cache because the monthly cap was hit. */
  stale?: boolean;
}

/**
 * A provider integration.
 *  P = call params (client input), R = raw upstream payload, M = mapped shape.
 */
export interface ProviderAdapter<P, R, M> {
  /** Stable slug — cache keys, logs, quota counters. e.g. 'oecd', 'zefix'. */
  id: string;
  /** Base URL; never read ad hoc. */
  baseUrl: string;
  /** Declared secrets; the gateway binds them to the callable. Empty for open data. */
  secrets: SecretParam[];
  /** Where cache entries may be shared. */
  scope: CacheScope;
  /** TTL for cache freshness. Immutable data → long; live data → short. */
  ttlSeconds: number;
  /** Whether the callable requires an authenticated user. */
  requiresAuth: boolean;
  /** Optional per-caller window (defaults applied by the gateway if omitted). */
  windowLimit?: WindowLimit;
  /** Optional monthly cap on upstream calls; on breach → serve stale, then fail soft. */
  monthlyCap?: number;
  /** Attribution the UI must render. */
  attribution: Attribution;
  /** Fetch the raw payload. Throws on transport error; gateway maps it. */
  fetch(params: P, ctx: GatewayContext): Promise<R>;
  /** Map raw → vendor-neutral internal shape. Pure; re-runnable over cached raw. */
  map(raw: R, params: P): M;
  /** Extract the upstream data timestamp for "Stand: …". */
  sourceTimestamp(raw: R): string | null;
}
