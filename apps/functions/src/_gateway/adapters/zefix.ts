// apps/functions/src/_gateway/adapters/zefix.ts
//
// Zefix retrofit onto the gateway. Two adapters preserving the zefixSearch /
// zefixGetByUid callable names + response shapes (client unchanged). Adds shared
// cache + quota + attribution to a live provider. Basic-Auth secret; NEVER log
// the raw AxiosError (config carries the credential).

import { defineSecret } from 'firebase-functions/params';
import type { ProviderAdapter, GatewayContext } from '../provider';
import { gatewayFetch } from '../http';

const zefixUid = defineSecret('ZEFIX_UID');
const zefixPwd = defineSecret('ZEFIX_PWD');

const ZEFIX_BASE = 'https://www.zefixintg.admin.ch/ZefixPublicREST/api/v1';

const LEGAL_FORM_NAMES: Record<number, string> = {
  1: 'Einzelunternehmen', 2: 'Kollektivgesellschaft', 3: 'AG', 4: 'GmbH',
  5: 'Genossenschaft', 6: 'Verein', 7: 'Stiftung', 8: 'Institut des öffentlichen Rechts',
};

function basicAuthHeader(): string {
  return 'Basic ' + Buffer.from(`${zefixUid.value()}:${zefixPwd.value()}`).toString('base64');
}

function extractUidString(uid: unknown): string {
  if (typeof uid === 'string') return uid;
  if (uid && typeof uid === 'object' && 'uid' in uid) return String((uid as { uid: string }).uid);
  return '';
}

// --- shared types (kept identical to the old zefix/index.ts) ---
export interface ZefixSearchResult { name: string; legalSeat: string; uid: string }
export interface ZefixSearchResponse { results: ZefixSearchResult[] }
export interface ZefixCompanyDetails {
  name: string; taxId: string; streetName: string; streetNumber: string;
  countryCode: string; zipCode: string; city: string; notes: string;
}

const ATTRIBUTION = { provider: 'Zefix', url: 'https://www.zefix.ch/', licence: 'Federal Commercial Registry' };

// ---------- search ----------
export function mapZefixSearch(raw: unknown): ZefixSearchResponse {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { list?: unknown[] })?.list)
      ? (raw as { list: unknown[] }).list
      : [];
  const results = list.map((c) => {
    const company = c as Record<string, unknown>;
    return {
      name: String(company['name'] ?? ''),
      legalSeat: String(company['legalSeat'] ?? ''),
      uid: extractUidString(company['uid']),
    };
  });
  return { results };
}

export const zefixSearchAdapter: ProviderAdapter<{ name: string; tenantId?: string }, unknown, ZefixSearchResponse> = {
  id: 'zefix-search',
  baseUrl: ZEFIX_BASE,
  secrets: [zefixUid, zefixPwd],
  scope: 'shared',
  ttlSeconds: 24 * 60 * 60,
  requiresAuth: true,
  attribution: ATTRIBUTION,
  async fetch(params, _ctx: GatewayContext) {
    const name = params.name?.trim();
    if (!name) throw new (await import('firebase-functions/v2/https')).HttpsError('invalid-argument', 'name is required');
    const res = await gatewayFetch(`${ZEFIX_BASE}/company/search`, {
      method: 'POST',
      data: { name, maxEntries: 20, offset: 0 },
      headers: { Authorization: basicAuthHeader(), 'Content-Type': 'application/json' },
    });
    return res.data;
  },
  map: mapZefixSearch,
  sourceTimestamp: () => null,
};

// ---------- details by uid ----------
export function mapZefixDetails(raw: unknown): ZefixCompanyDetails {
  const c: Record<string, unknown> = Array.isArray(raw)
    ? (raw[0] as Record<string, unknown>)
    : (raw as Record<string, unknown>);
  const address = (c?.['address'] as Record<string, unknown>) ?? {};
  const legalFormId =
    typeof c?.['legalFormId'] === 'number'
      ? (c['legalFormId'] as number)
      : typeof (c?.['legalForm'] as Record<string, unknown> | undefined)?.['id'] === 'number'
        ? ((c['legalForm'] as Record<string, unknown>)['id'] as number)
        : 0;
  const legalFormName = LEGAL_FORM_NAMES[legalFormId] ?? '';
  const noteParts: string[] = [];
  if (c?.['purpose'] && String(c['purpose']).trim().length > 0) noteParts.push(String(c['purpose']).trim());
  if (legalFormName) noteParts.push(`Rechtsform: ${legalFormName}`);
  return {
    name: String(c?.['name'] ?? ''),
    taxId: extractUidString(c?.['uid']),
    streetName: String(address['street'] ?? ''),
    streetNumber: String(address['houseNumber'] ?? ''),
    countryCode: 'CH',
    zipCode: address['swissZipCode'] != null ? String(address['swissZipCode']) : '',
    city: String(address['city'] ?? ''),
    notes: noteParts.join('\n'),
  };
}

export const zefixDetailsAdapter: ProviderAdapter<{ uid: string; tenantId?: string }, unknown, ZefixCompanyDetails> = {
  id: 'zefix-details',
  baseUrl: ZEFIX_BASE,
  secrets: [zefixUid, zefixPwd],
  scope: 'shared',
  ttlSeconds: 24 * 60 * 60,
  requiresAuth: true,
  attribution: ATTRIBUTION,
  async fetch(params, _ctx: GatewayContext) {
    const uid = params.uid?.trim();
    if (!uid) throw new (await import('firebase-functions/v2/https')).HttpsError('invalid-argument', 'uid is required');
    const res = await gatewayFetch(`${ZEFIX_BASE}/company/uid/${encodeURIComponent(uid)}`, {
      method: 'GET',
      headers: { Authorization: basicAuthHeader() },
    });
    return res.data;
  },
  map: mapZefixDetails,
  sourceTimestamp: () => null,
};
