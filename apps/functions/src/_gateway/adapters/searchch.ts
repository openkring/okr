// apps/functions/src/_gateway/adapters/searchch.ts
//
// search.ch (tel.search.ch) person-directory retrofit onto the gateway. Same
// callable name as before (`searchChSearchPerson`); the payload now arrives
// nested under `data` with attribution + freshness, so the client unwraps one
// level more (see PersonDirectoryService).
//
// Two things make this adapter differ from oecd/zefix:
//
//  1. The API key is PER TENANT and lives in Firestore (`app-secrets/{tenantId}`),
//     not in a `defineSecret` param — so `secrets` is empty and `fetch` reads the
//     key using `ctx.tenantId`. This is the per-tenant-key seam the gateway spec
//     kept open. It is also why `scope` is 'tenant': a shared cache would let one
//     tenant's search be answered out of a lookup another tenant paid for.
//
//  2. The cached payload is third-party PERSONAL DATA (name, street, phone,
//     email of the looked-up person). `apiCache` is admin-SDK-only and TTL-swept,
//     but retention still has to be justified, so the TTL is one hour rather than
//     the 24h the open-data adapters use — long enough to absorb the real pattern
//     (a user refining or reopening the same search) without keeping a stranger's
//     address on our side for a day. Only the SEARCH TERMS reach the cache doc id,
//     and only as a sha256 hash (see cache-key.ts).
//
// Deliberately NO `monthlyCap`: the `_apiQuota` counter is per PROVIDER, not per
// tenant, so a cap here would let one tenant's usage lock out another tenant
// whose own paid key is untouched. The per-caller window is the bound until the
// counter learns about tenants.

import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import type { ProviderAdapter, GatewayContext } from '../provider';
import { gatewayFetch } from '../http';
import { parseTelFeed, feedUpdatedAt, PersonDirectoryResult } from '../../searchch/parse';

export type { PersonDirectoryResult };

const SEARCH_CH_BASE = 'https://tel.search.ch/api/';

/** `tenantId` is no longer input — the gateway derives it (see resolveTenantId)
 *  and `stripTenantId` removes any client-sent value before the cache key is
 *  hashed. Kept off this type so no new caller reintroduces it. */
export interface SearchChParams {
  firstName?: string;
  lastName?: string;
  location?: string;
}

export interface SearchChData {
  results: PersonDirectoryResult[];
}

/** Pure: the `was=` search term. Exported for the unit test. */
export function searchChQueryName(params: SearchChParams): string {
  return `${(params.firstName ?? '').trim()} ${(params.lastName ?? '').trim()}`.trim();
}

/** Read the tenant's search.ch key from the server-only `app-secrets` doc.
 *  Admin SDK bypasses rules; the key never reaches the client. */
async function readTenantApiKey(tenantId: string): Promise<string> {
  const snap = await getFirestore().doc(`app-secrets/${tenantId}`).get();
  const key = snap.exists ? (snap.data()?.['searchChApiKey'] as string | undefined) : undefined;
  if (!key || key.trim().length === 0) {
    throw new HttpsError('failed-precondition', 'no search.ch key configured for tenant');
  }
  return key.trim();
}

export function mapSearchCh(raw: string): SearchChData {
  return { results: parseTelFeed(String(raw)) };
}

export const searchChAdapter: ProviderAdapter<SearchChParams, string, SearchChData> = {
  id: 'searchch-person',
  baseUrl: SEARCH_CH_BASE,
  // Per-tenant key from Firestore, not a deploy-time secret param.
  secrets: [],
  scope: 'tenant',
  ttlSeconds: 60 * 60, // 1h — see the PII note at the top of this file.
  requiresAuth: true,
  attribution: {
    provider: 'search.ch',
    url: 'https://tel.search.ch/',
    licence: 'Swisscom Directories AG',
  },
  async fetch(params, ctx: GatewayContext) {
    const name = searchChQueryName(params);
    if (name.length === 0) {
      throw new HttpsError('invalid-argument', 'firstName or lastName is required');
    }
    // ctx.tenantId is resolved server-side from users/{uid}.tenants[0] and a
    // 'tenant'-scoped adapter is rejected when it cannot be resolved — which is
    // what the old hand-rolled "caller belongs to tenant" check was for.
    const key = await readTenantApiKey(ctx.tenantId);
    // Do NOT log the searched person name — PII (privacy inventory §7.2). The
    // gateway logs only the provider id.
    const res = await gatewayFetch<string>(SEARCH_CH_BASE, {
      method: 'GET',
      params: {
        was: name,
        wo: (params.location ?? '').trim() || undefined,
        key,
        maxnum: 20,
        lang: 'de',
      },
      responseType: 'text',
    });
    return String(res.data);
  },
  map: mapSearchCh,
  sourceTimestamp: (raw) => feedUpdatedAt(String(raw)),
};
