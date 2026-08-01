// apps/functions/src/_gateway/adapters/location.ts
//
// Geocoding adapters for `convertLocation` — what3words (both directions) and
// Google Maps geocoding (both directions).
//
// Unlike oecd/zefix/searchch there is NO `makeGatewayCallable` here.
// `convertLocation` is an ORCHESTRATOR: one call runs up to four different
// upstream lookups, each best-effort, and the callable's response shape is a
// merged location rather than one provider's payload. So the callable stays
// hand-written (see ../../location/index.ts) and drives `runGateway` once per
// step — the gateway still supplies cache, quota, retry, timeout and error
// mapping to each individual lookup.
//
// scope: 'shared' for all four. A coordinate, an address and a what3words
// square mean the same thing for every tenant, and the inputs are venue
// locations (the `locations` collection is classified "not personal data" in
// the subject-data map), not member addresses.
//
// TTL differs by provider on purpose:
//  - what3words is a deterministic algorithm over the globe — the mapping does
//    not change, so the only reason to expire it is hygiene. 180 days.
//  - Google is capped at 30 days, the ceiling the Maps Platform terms put on
//    temporarily caching geocoding output. ⚠️ That allowance is written for the
//    lat/lng VALUES; it is less clear that it covers the `formatted_address` the
//    reverse-geocode adapter stores. 30 days is the conservative reading, not a
//    verified one — confirm against the current terms before relying on it, and
//    shorten `gmap-reverse` if the answer is no. Never raise either past 30.

import { defineSecret } from 'firebase-functions/params';
import { HttpsError } from 'firebase-functions/v2/https';
import type { ProviderAdapter, GatewayContext } from '../provider';
import { gatewayFetch } from '../http';

const w3wApiKey = defineSecret('W3W_APIKEY');
const gmapKey = defineSecret('GMAP_KEY');

const W3W_BASE = 'https://api.what3words.com/v3';
const GMAP_BASE = 'https://maps.googleapis.com/maps/api';

const DAY = 24 * 60 * 60;
const W3W_TTL = 180 * DAY;
const GMAP_TTL = 30 * DAY; // Google Maps Platform caching ceiling — see header.

// Both keys are OURS and shared across tenants, so the failure mode of a runaway
// caller is a bill on our account — which is exactly what the monthly cap is for.
// 10k geocoding calls is roughly USD 50 at list price. On breach the gateway
// serves stale cache, then fails soft, and the orchestrator degrades to "no
// enrichment" rather than an error.
const MONTHLY_CAP = 10_000;

const W3W_ATTRIBUTION = {
  provider: 'what3words',
  url: 'https://what3words.com/',
  licence: 'what3words API Terms',
};
const GMAP_ATTRIBUTION = {
  provider: 'Google Maps',
  url: 'https://www.google.com/maps',
  licence: 'Google Maps Platform Terms',
};

export interface Coords {
  lat: number;
  lng: number;
}

/**
 * Normalise a coordinate to 6 decimals (~0.11 m) before it reaches either the
 * upstream call or the cache key. Float noise in the last bits would otherwise
 * make every request a cache miss for a position the user did not actually move.
 * Applied to the params themselves so the key and the call can never disagree.
 */
export function roundCoord(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function normaliseCoordParams(p: Coords): Coords {
  return { lat: roundCoord(p.lat), lng: roundCoord(p.lng) };
}

// --------------------------------- what3words ---------------------------------

interface W3wRaw {
  coordinates?: { lat?: number; lng?: number };
  words?: string;
  error?: { code?: string; message?: string };
}

/** w3w answers some failures with HTTP 200 + an `error` object. Throwing here
 *  keeps a failure out of the cache — a cached error would persist for months. */
function assertNoW3wError(raw: W3wRaw): void {
  if (raw?.error) {
    throw new HttpsError('unavailable', `what3words error: ${raw.error.code ?? 'unknown'}`);
  }
}

export function mapW3wCoords(raw: W3wRaw): Coords | null {
  const c = raw?.coordinates;
  return typeof c?.lat === 'number' && typeof c?.lng === 'number' ? { lat: c.lat, lng: c.lng } : null;
}

export function mapW3wWords(raw: W3wRaw): string | null {
  const words = raw?.words;
  return typeof words === 'string' && words.trim().length > 0 ? words.trim() : null;
}

export const w3wToCoordsAdapter: ProviderAdapter<{ words: string }, W3wRaw, Coords | null> = {
  id: 'w3w-to-coords',
  baseUrl: W3W_BASE,
  secrets: [w3wApiKey],
  scope: 'shared',
  ttlSeconds: W3W_TTL,
  requiresAuth: true,
  monthlyCap: MONTHLY_CAP,
  attribution: W3W_ATTRIBUTION,
  async fetch(params, _ctx: GatewayContext) {
    const words = params.words?.trim();
    if (!words) throw new HttpsError('invalid-argument', 'words is required');
    const res = await gatewayFetch<W3wRaw>(`${W3W_BASE}/convert-to-coordinates`, {
      method: 'GET',
      params: { words, key: w3wApiKey.value() },
    });
    assertNoW3wError(res.data);
    return res.data;
  },
  map: mapW3wCoords,
  sourceTimestamp: () => null,
};

export const coordsToW3wAdapter: ProviderAdapter<Coords, W3wRaw, string | null> = {
  id: 'coords-to-w3w',
  baseUrl: W3W_BASE,
  secrets: [w3wApiKey],
  scope: 'shared',
  ttlSeconds: W3W_TTL,
  requiresAuth: true,
  monthlyCap: MONTHLY_CAP,
  attribution: W3W_ATTRIBUTION,
  async fetch(params, _ctx: GatewayContext) {
    const res = await gatewayFetch<W3wRaw>(`${W3W_BASE}/convert-to-3wa`, {
      method: 'GET',
      params: {
        coordinates: `${params.lat},${params.lng}`,
        key: w3wApiKey.value(),
        language: 'en',
      },
    });
    assertNoW3wError(res.data);
    return res.data;
  },
  map: mapW3wWords,
  sourceTimestamp: () => null,
};

// --------------------------------- Google Maps ---------------------------------

interface GmapRaw {
  status?: string;
  error_message?: string;
  results?: {
    formatted_address?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
  }[];
}

/**
 * Google answers everything with HTTP 200 and puts the outcome in `status`, so
 * without this guard a REQUEST_DENIED (revoked/misconfigured key) or an
 * OVER_QUERY_LIMIT would map to "no result" — indistinguishable from a genuine
 * miss, and then cached for 30 days. Only OK and ZERO_RESULTS may be cached;
 * ZERO_RESULTS is a real, stable answer.
 *
 * This is stricter than the pre-gateway code, which read `results[0]` blindly
 * and silently swallowed a broken key as "address not found".
 */
export function assertGmapUsable(raw: GmapRaw): void {
  const status = raw?.status;
  if (status === 'OK' || status === 'ZERO_RESULTS') return;
  throw new HttpsError('unavailable', `Google Maps status ${status ?? 'unknown'}`);
}

export function mapGmapCoords(raw: GmapRaw): Coords | null {
  const loc = raw?.results?.[0]?.geometry?.location;
  return typeof loc?.lat === 'number' && typeof loc?.lng === 'number'
    ? { lat: loc.lat, lng: loc.lng }
    : null;
}

export function mapGmapAddress(raw: GmapRaw): string | null {
  const addr = raw?.results?.[0]?.formatted_address;
  return typeof addr === 'string' && addr.trim().length > 0 ? addr.trim() : null;
}

export const gmapGeocodeAdapter: ProviderAdapter<{ address: string }, GmapRaw, Coords | null> = {
  id: 'gmap-geocode',
  baseUrl: GMAP_BASE,
  secrets: [gmapKey],
  scope: 'shared',
  ttlSeconds: GMAP_TTL,
  requiresAuth: true,
  monthlyCap: MONTHLY_CAP,
  attribution: GMAP_ATTRIBUTION,
  async fetch(params, _ctx: GatewayContext) {
    const address = params.address?.trim();
    if (!address) throw new HttpsError('invalid-argument', 'address is required');
    const res = await gatewayFetch<GmapRaw>(`${GMAP_BASE}/geocode/json`, {
      method: 'GET',
      params: { address, key: gmapKey.value() },
    });
    assertGmapUsable(res.data);
    return res.data;
  },
  map: mapGmapCoords,
  sourceTimestamp: () => null,
};

export const gmapReverseAdapter: ProviderAdapter<Coords, GmapRaw, string | null> = {
  id: 'gmap-reverse',
  baseUrl: GMAP_BASE,
  secrets: [gmapKey],
  scope: 'shared',
  ttlSeconds: GMAP_TTL,
  requiresAuth: true,
  monthlyCap: MONTHLY_CAP,
  attribution: GMAP_ATTRIBUTION,
  async fetch(params, _ctx: GatewayContext) {
    const res = await gatewayFetch<GmapRaw>(`${GMAP_BASE}/geocode/json`, {
      method: 'GET',
      params: { latlng: `${params.lat},${params.lng}`, key: gmapKey.value() },
    });
    assertGmapUsable(res.data);
    return res.data;
  },
  map: mapGmapAddress,
  sourceTimestamp: () => null,
};

/** Every secret the orchestrating callable must bind. */
export const LOCATION_SECRETS = [w3wApiKey, gmapKey];
