// apps/functions/src/_gateway/adapters/elevation.ts
//
// Terrain-height adapters for `getTerrainElevations` (spec 1.128): swisstopo's
// profile service (swissALTI3D / DHM25) inside Switzerland, Open-Meteo's
// elevation API (Copernicus DEM, 90 m) everywhere else and as the fallback.
// Both are open data without a key. Like `convertLocation`, the callable is an
// orchestrator (../../elevation/index.ts) that drives `runGateway` per provider.
//
// scope: 'user'. The points are a recorded route — personal data — so a cache
// entry is never shared with another caller, even for the same coordinates.
// The cache key is a hash of the points, and the cached answer holds only
// distances and heights (no coordinates), so an entry does not reveal the route.
// TTL 30 days: terrain does not change, the bound is storage hygiene. The
// client stores the heights on the track itself after the first lookup, so the
// cache only answers repeated views of a Strecke that is not uploaded yet.

import type { ProviderAdapter } from '../provider';
import { gatewayFetch } from '../http';

export interface ElevationParams {
  /** 2–100 points, rounded to 5 decimals by the orchestrator */
  points: { lat: number; lng: number }[];
}

const DAY = 24 * 60 * 60;
const TTL = 30 * DAY;
// free open-data services: the cap guards their fair-use limits, not a bill
const MONTHLY_CAP = 20_000;
const WINDOW = { limit: 30, windowMs: 60_000 };

const SWISSTOPO_PROFILE_URL = 'https://api3.geo.admin.ch/rest/services/profile.json';
const OPEN_METEO_ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

/** Rough WGS84 box around Switzerland and Liechtenstein; a point outside goes to Open-Meteo. */
const CH_BOX = { minLat: 45.8, maxLat: 47.85, minLng: 5.9, maxLng: 10.55 };

export function inSwitzerland(p: { lat: number; lng: number }): boolean {
  return p.lat >= CH_BOX.minLat && p.lat <= CH_BOX.maxLat && p.lng >= CH_BOX.minLng && p.lng <= CH_BOX.maxLng;
}

/** WGS84 → LV95 (EPSG:2056) with swisstopo's approximate formulas (accuracy ~1 m — plenty for a height lookup). */
export function wgs84ToLv95(lat: number, lng: number): [number, number] {
  const phi = (lat * 3600 - 169028.66) / 10000;
  const lambda = (lng * 3600 - 26782.5) / 10000;
  const e = 2600072.37 + 211455.93 * lambda - 10938.51 * lambda * phi - 0.36 * lambda * phi * phi - 44.54 * lambda ** 3;
  const n = 1200147.07 + 308807.95 * phi + 3745.25 * lambda * lambda + 76.63 * phi * phi - 194.56 * lambda * lambda * phi + 119.79 * phi ** 3;
  return [Math.round(e * 10) / 10, Math.round(n * 10) / 10];
}

/** One row of swisstopo's profile.json: `dist` along the line in metres, heights per model. */
export interface SwisstopoProfileRow {
  dist: number;
  alts: { COMB?: number | null; DTM2?: number | null; DTM25?: number | null };
}

/**
 * The height at each input point: the profile is resampled along the line, so the rows are interpolated at the
 * points' own distances along it (planar LV95, the same metric swisstopo measures `dist` in). null where none.
 */
export function heightsFromProfile(points: { lat: number; lng: number }[], rows: SwisstopoProfileRow[]): (number | null)[] {
  const known = rows
    .map((r) => ({ dist: r.dist, alt: r.alts.COMB ?? r.alts.DTM2 ?? r.alts.DTM25 ?? null }))
    .filter((r): r is { dist: number; alt: number } => typeof r.dist === 'number' && typeof r.alt === 'number' && Number.isFinite(r.alt))
    .sort((a, b) => a.dist - b.dist);
  if (known.length === 0) return points.map(() => null);
  const lv95 = points.map((p) => wgs84ToLv95(p.lat, p.lng));
  let dist = 0;
  let j = 0;
  return lv95.map((c, i) => {
    if (i > 0) dist += Math.hypot(c[0] - lv95[i - 1][0], c[1] - lv95[i - 1][1]);
    while (j < known.length - 1 && known[j + 1].dist <= dist) j++;
    const a = known[j];
    const b = known[Math.min(j + 1, known.length - 1)];
    if (dist <= known[0].dist) return round1(known[0].alt);
    if (b === a || b.dist <= a.dist) return round1(a.alt);
    return round1(a.alt + ((b.alt - a.alt) * (dist - a.dist)) / (b.dist - a.dist));
  });
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export const swisstopoElevationAdapter: ProviderAdapter<ElevationParams, SwisstopoProfileRow[], (number | null)[]> = {
  id: 'elevation-swisstopo',
  baseUrl: SWISSTOPO_PROFILE_URL,
  secrets: [],
  scope: 'user',
  ttlSeconds: TTL,
  requiresAuth: true,
  windowLimit: WINDOW,
  monthlyCap: MONTHLY_CAP,
  attribution: { provider: 'swisstopo', url: 'https://www.swisstopo.admin.ch/', licence: 'Open Government Data (OGD)' },
  async fetch(params) {
    const geom = { type: 'LineString', coordinates: params.points.map((p) => wgs84ToLv95(p.lat, p.lng)) };
    const res = await gatewayFetch<SwisstopoProfileRow[]>(SWISSTOPO_PROFILE_URL, {
      method: 'GET',
      // distinct_points keeps the input vertices in the resampled profile
      params: { geom: JSON.stringify(geom), sr: 2056, nb_points: Math.min(500, Math.max(200, params.points.length * 2)), distinct_points: true },
    });
    // only distance and heights reach the cache: the answer's easting/northing would store the route itself
    return Array.isArray(res.data) ? res.data.map((r) => ({ dist: r.dist, alts: r.alts })) : [];
  },
  map: (raw, params) => heightsFromProfile(params.points, raw),
  sourceTimestamp: () => null,
};

interface OpenMeteoElevation {
  elevation?: (number | null)[];
}

export const openMeteoElevationAdapter: ProviderAdapter<ElevationParams, OpenMeteoElevation, (number | null)[]> = {
  id: 'elevation-openmeteo',
  baseUrl: OPEN_METEO_ELEVATION_URL,
  secrets: [],
  scope: 'user',
  ttlSeconds: TTL,
  requiresAuth: true,
  windowLimit: WINDOW,
  monthlyCap: MONTHLY_CAP,
  attribution: { provider: 'Open-Meteo', url: 'https://open-meteo.com/', licence: 'CC BY 4.0, Copernicus DEM' },
  async fetch(params) {
    const res = await gatewayFetch<OpenMeteoElevation>(OPEN_METEO_ELEVATION_URL, {
      method: 'GET',
      params: { latitude: params.points.map((p) => p.lat).join(','), longitude: params.points.map((p) => p.lng).join(',') },
    });
    return res.data ?? {};
  },
  map: (raw, params) => params.points.map((_, i) => {
    const v = raw.elevation?.[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }),
  sourceTimestamp: () => null,
};
