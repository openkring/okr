// apps/functions/src/_gateway/adapters/icebergs.ts
//
// Current Antarctic iceberg positions for the travel journal map (spec 2.122): BYU's «Current Icebergs» page, one
// HTML table, parsed by `parseByuIcebergs` of the journal util. Open data without a key.
//
// scope: 'shared'. The table is public and the same for every caller and tenant, so one cache entry serves all.
// TTL 30 days (spec 2.122: fetched again only when the snapshot is older than a month; BYU revises it weekly).
// The cache holds the parsed snapshot, not the page. A page that parses to no iceberg throws, so the gateway keeps
// serving the last good snapshot (stale-if-error) instead of caching an empty layer.

import { BYU_ICEBERGS_ATTRIBUTION, BYU_ICEBERGS_URL, IcebergSnapshot, parseByuIcebergs } from '@okr/travel-journal-util';
import type { ProviderAdapter } from '../provider';
import { gatewayFetch } from '../http';

const DAY = 24 * 60 * 60;

export const byuIcebergsAdapter: ProviderAdapter<Record<string, never>, IcebergSnapshot, IcebergSnapshot> = {
  id: 'icebergs-byu',
  baseUrl: BYU_ICEBERGS_URL,
  secrets: [],
  scope: 'shared',
  ttlSeconds: 30 * DAY,
  requiresAuth: true,
  windowLimit: { limit: 10, windowMs: 60_000 },
  // one fetch a month is the normal case; the cap only stops a loop from hammering an academic server
  monthlyCap: 50,
  attribution: BYU_ICEBERGS_ATTRIBUTION,
  async fetch() {
    const res = await gatewayFetch<string>(BYU_ICEBERGS_URL, { method: 'GET', responseType: 'text', maxBytes: 1024 * 1024 });
    const snapshot = parseByuIcebergs(String(res.data));
    if (snapshot.icebergs.length === 0) throw new Error('icebergs-byu: no iceberg rows in the page');
    return snapshot;
  },
  map: (raw) => raw,
  sourceTimestamp: (raw) => raw.revisedAt || null,
};
