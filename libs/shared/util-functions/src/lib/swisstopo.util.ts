import * as logger from 'firebase-functions/logger';
import type { AddressModel } from '@okr/shared-models';

/** One address from the swisstopo (geo.admin.ch) address search. Public open data. */
export interface SwissAddressHit {
  egaid: string;
  streetName: string;
  streetNumber: string;
  zipCode: string;
  city: string;
  latitude: number;
  longitude: number;
  label: string;
}

export type GeocodeOutcome = { kind: 'exact'; hit: SwissAddressHit } | { kind: 'ambiguous'; hits: SwissAddressHit[] } | { kind: 'none' };

const SEARCH_URL = 'https://api3.geo.admin.ch/rest/services/api/SearchServer?type=locations&origins=address&sr=4326&limit=10&searchText=';
const THROTTLE_MS = 200;
const CACHE_MAX = 500;

const cache = new Map<string, SwissAddressHit[]>();
let lastFetchAt = 0;
let chain: Promise<unknown> = Promise.resolve();

/** Lowercase, trim and collapse whitespace: the cache key and the search text. */
export function normaliseQuery(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase();
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** "Seestrasse 12 <b>8712 Stäfa</b>" -> street, number, zip, city. */
function splitLabel(label: string): { streetName: string; streetNumber: string; zipCode: string; city: string } {
  const m = /^(.*?)\s+(\d{4})\s+(.+)$/.exec(label);
  const streetPart = m ? m[1] : label;
  const zipCode = m ? m[2] : '';
  const city = m ? m[3] : '';
  const n = /^(.*?)\s+(\d+\S*)$/.exec(streetPart);
  return { streetName: n ? n[1] : streetPart, streetNumber: n ? n[2] : '', zipCode, city };
}

/** The official EGAID is the last path segment of the link into the federal address directory. */
function egaidFromLinks(links: unknown): string {
  if (!Array.isArray(links)) return '';
  for (const l of links) {
    const href = (l as { href?: unknown })?.href;
    if (typeof href !== 'string') continue;
    const m = /ch\.swisstopo\.amtliches-gebaeudeadressverzeichnis\/(\d+)/.exec(href);
    if (m) return m[1];
  }
  return '';
}

/** Maps a swisstopo SearchServer response; hits without a featureId or without an EGAID link are dropped. Never throws. */
export function parseSearchResponse(json: unknown): SwissAddressHit[] {
  const results = (json as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const hits: SwissAddressHit[] = [];
  for (const r of results) {
    const attrs = (r as { attrs?: Record<string, unknown> })?.attrs;
    if (!attrs || attrs['featureId'] === undefined || attrs['featureId'] === null || attrs['featureId'] === '') continue;
    const egaid = egaidFromLinks(attrs['links']);
    if (!egaid) continue;
    const label = String(attrs['label'] ?? '')
      .replace(/<\/?b>/gi, '')
      .trim();
    hits.push({
      egaid,
      ...splitLabel(label),
      latitude: Number(attrs['lat']),
      longitude: Number(attrs['lon']),
      label,
    });
  }
  return hits;
}

function remember(key: string, hits: SwissAddressHit[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, hits);
}

/** Runs the fetch after the previous one, keeping >= 200 ms between consecutive real fetches. */
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const wait = lastFetchAt + THROTTLE_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      return await task();
    } finally {
      lastFetchAt = Date.now();
    }
  });
  chain = run.catch(() => undefined);
  return run;
}

/** Throttled (<= 5 req/s), cached search. Returns [] on network error, non-2xx or 429; never throws. */
export async function searchSwissAddresses(q: string, fetchFn: typeof fetch = fetch): Promise<SwissAddressHit[]> {
  const key = normaliseQuery(q);
  if (!key) return [];
  const cached = cache.get(key);
  if (cached) return cached;
  try {
    const hits = await throttled(async () => {
      const res = await fetchFn(SEARCH_URL + encodeURIComponent(key));
      if (!res.ok) {
        logger.warn(`swisstopo search answered ${res.status}`);
        return null;
      }
      return parseSearchResponse(await res.json());
    });
    if (hits === null) return [];
    remember(key, hits);
    return hits;
  } catch (e) {
    logger.warn(`swisstopo search failed: ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

/** exact = exactly one hit whose street, number and zip all match the snapshot (case/diacritics-insensitive). */
export async function geocodeSnapshot(row: Pick<AddressModel, 'streetName' | 'streetNumber' | 'zipCode' | 'city'>, fetchFn: typeof fetch = fetch): Promise<GeocodeOutcome> {
  const hits = await searchSwissAddresses(`${row.streetName} ${row.streetNumber} ${row.zipCode} ${row.city}`, fetchFn);
  if (hits.length === 0) return { kind: 'none' };
  const exact = hits.filter((h) => fold(h.streetName) === fold(row.streetName) && fold(h.streetNumber) === fold(row.streetNumber) && h.zipCode === row.zipCode.trim());
  if (exact.length === 1) return { kind: 'exact', hit: exact[0] };
  return { kind: 'ambiguous', hits };
}

/** Test hook: clears the module-level cache and throttle state. */
export function resetSwisstopoState(): void {
  cache.clear();
  lastFetchAt = 0;
  chain = Promise.resolve();
}
