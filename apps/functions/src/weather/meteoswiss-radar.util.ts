import proj4 from 'proj4';

import { WeatherRadarBounds, WeatherRadarFrame } from '@okr/shared-models';
import { RADAR_SCALE, RadarScaleStep, hexToRgb, radarScaleIndex } from '@okr/weather-util';

/** Pure helpers of the MeteoSwiss radar pipeline (spec 1.110). No I/O here — see fetch-meteoswiss-radar.ts. */

export const RADAR_STORAGE_PREFIX = 'weather/radar/meteoswiss';

/** O3: the timeline carries 6 h of 5-minute frames. */
export const RADAR_WINDOW_HOURS = 6;

/** Grid geometry as stored in the ODIM `/where` group of a PRECIP (rzc) file. */
export interface OdimWhere {
  projdef: string;
  xsize: number;
  ysize: number;
  xscale: number;
  yscale: number;
  UL_lon: number; UL_lat: number;
  UR_lon: number; UR_lat: number;
  LL_lon: number; LL_lat: number;
  LR_lon: number; LR_lat: number;
}

/** A PRECIP file listed in a STAC item. */
export interface RadarSourceFile {
  name: string;
  href: string;
  time: number;   // unix seconds, end of the 5-minute interval
}

/** Target raster: Web Mercator, plus for every target pixel the source pixel it shows (-1 = none). */
export interface RadarProjection {
  width: number;
  height: number;
  bounds: WeatherRadarBounds;
  lut: Int32Array;
}

/**
 * `rzc262951100rl.001.h5` → the measurement time.
 *
 * The name is `rzc` + YY + day-of-year + HHMM (UTC) + a two-letter suffix. The suffix has been
 * `rl` on every file seen so far; it is not part of the time and is not checked.
 */
export function parseRadarFileName(name: string): number | undefined {
  const m = /^rzc(\d{2})(\d{3})(\d{2})(\d{2})[a-z0-9]*\.001\.h5$/i.exec(name);
  if (!m) return undefined;
  const [, yy, doy, hh, mm] = m;
  const ms = Date.UTC(2000 + Number(yy), 0, Number(doy), Number(hh), Number(mm));
  return ms / 1000;
}

/** STAC item id for the UTC day containing `time` (unix seconds), e.g. '20261022-ch'. */
export function stacItemId(time: number): string {
  return `${new Date(time * 1000).toISOString().slice(0, 10).replace(/-/g, '')}-ch`;
}

/** Storage path of a frame. The name is the UTC measurement time, yyyyMMddHHmm. */
export function framePath(time: number): string {
  const stamp = new Date(time * 1000).toISOString().replace(/\D/g, '').slice(0, 12);
  return `${RADAR_STORAGE_PREFIX}/${stamp}.png`;
}

/** The STAC items to read: today's, plus yesterday's while the window still reaches into it. */
export function stacItemIdsForWindow(now: number, windowHours = RADAR_WINDOW_HOURS): string[] {
  return [...new Set([stacItemId(now - windowHours * 3600), stacItemId(now)])];
}

/**
 * PRECIP files inside the window that are not yet a frame, oldest first.
 * Idempotency lives here: a file whose time is already in the list is never rendered again.
 */
export function selectNewFiles(
  assets: Record<string, { href: string }>,
  knownTimes: Set<number>,
  now: number,
  windowHours = RADAR_WINDOW_HOURS,
): RadarSourceFile[] {
  const start = now - windowHours * 3600;
  return Object.entries(assets)
    .map(([name, asset]) => ({ name, href: asset.href, time: parseRadarFileName(name) }))
    .filter((f): f is RadarSourceFile => f.time !== undefined && f.time >= start && !knownTimes.has(f.time))
    .sort((a, b) => a.time - b.time);
}

/** Existing plus new frames, deduplicated by time, trimmed to the window, oldest first. */
export function mergeFrames(
  existing: WeatherRadarFrame[],
  added: WeatherRadarFrame[],
  now: number,
  windowHours = RADAR_WINDOW_HOURS,
): WeatherRadarFrame[] {
  const start = now - windowHours * 3600;
  const byTime = new Map<number, WeatherRadarFrame>();
  for (const f of [...existing, ...added]) if (f.time >= start) byTime.set(f.time, f);
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/**
 * Maps every pixel of a Web Mercator target raster to its pixel in the LV95 source grid.
 *
 * LV95 and Web Mercator are rotated and stretched against each other over Switzerland, so an
 * unprojected image would sit 1–2 km off at the edges. The mapping is the same for every frame of
 * the same grid, which is why it is computed once per cold start (~0.5 s) and reused.
 *
 * The target covers the lat/lon box around the four grid corners at roughly the source's 1 km;
 * pixels outside the rotated source rectangle stay -1 (transparent). Row 0 of the source is the
 * northern edge (ODIM convention).
 */
export function buildRadarProjection(where: OdimWhere): RadarProjection {
  const lv95 = proj4('WGS84', where.projdef);
  const mercator = proj4('WGS84', 'EPSG:3857');
  const toLv95 = proj4('EPSG:3857', where.projdef);

  const lats = [where.UL_lat, where.UR_lat, where.LL_lat, where.LR_lat];
  const lons = [where.UL_lon, where.UR_lon, where.LL_lon, where.LR_lon];
  const bounds: WeatherRadarBounds = {
    south: Math.min(...lats), west: Math.min(...lons), north: Math.max(...lats), east: Math.max(...lons),
  };

  const [mx0, my0] = mercator.forward([bounds.west, bounds.south]);
  const [mx1, my1] = mercator.forward([bounds.east, bounds.north]);
  const midLat = (bounds.south + bounds.north) / 2;
  const res = where.xscale / Math.cos((midLat * Math.PI) / 180);   // mercator metres per target pixel
  const width = Math.ceil((mx1 - mx0) / res);
  const height = Math.ceil((my1 - my0) / res);

  // the corners are the grid's outer edges; snap them to the grid scale (they arrive ±3 m off)
  const [ulx, uly] = lv95.forward([where.UL_lon, where.UL_lat]);
  const x0 = Math.round(ulx / where.xscale) * where.xscale;
  const y0 = Math.round(uly / where.yscale) * where.yscale;

  const lut = new Int32Array(width * height).fill(-1);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const [x, y] = toLv95.forward([mx0 + (i + 0.5) * res, my1 - (j + 0.5) * res]);
      const col = Math.floor((x - x0) / where.xscale);
      const row = Math.floor((y0 - y) / where.yscale);
      if (col >= 0 && col < where.xsize && row >= 0 && row < where.ysize) {
        lut[j * width + i] = row * where.xsize + col;
      }
    }
  }
  return { width, height, bounds, lut };
}

/**
 * Paints the rain rates (mm/h, NaN = no data) into an RGBA buffer through the projection.
 * Dry and missing pixels stay fully transparent. Returns the number of wet pixels as well, for the log.
 */
export function paintRadarFrame(
  rates: ArrayLike<number>,
  projection: RadarProjection,
  scale: readonly RadarScaleStep[] = RADAR_SCALE,
): { rgba: Uint8Array; wet: number } {
  const colors = scale.map((s) => hexToRgb(s.color));
  const rgba = new Uint8Array(projection.width * projection.height * 4);
  let wet = 0;
  for (let p = 0; p < projection.lut.length; p++) {
    const src = projection.lut[p];
    if (src < 0) continue;
    const step = radarScaleIndex(rates[src], scale);
    if (step < 0) continue;
    const [r, g, b] = colors[step];
    rgba.set([r, g, b, 255], p * 4);
    wet++;
  }
  return { rgba, wet };
}
