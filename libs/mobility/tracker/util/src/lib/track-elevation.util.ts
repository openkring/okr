import type { TransportMode } from '@okr/shared-models';
import type { TrackPoint } from './track-polyline.util';
import { distanceM } from './track-summary.util';

/** The chart shows only above this relief (max − min of the smoothed profile), spec 1.128 §3. */
export const ELEVATION_MIN_RANGE_M = 20;
/** Below this share of points with a GPS altitude, the heights come from a terrain model (spec §2). */
export const ELEVATION_GPS_MIN_COVERAGE = 0.8;
/** Moving-average window over the distance before climb and descent are counted. */
export const ELEVATION_SMOOTH_WINDOW_M = 100;
/** Climb and descent count steps of at least this height (hysteresis against GPS noise). */
export const ELEVATION_STEP_M = 3;
/** At most this many points go to the terrain lookup; the rest are interpolated. */
export const TERRAIN_MAX_SAMPLES = 100;

type ElevationSection = { mode: TransportMode; points: TrackPoint[] };

/** One point of the profile: distance from the start, smoothed height and where it is. */
export interface ElevationPoint {
  distM: number;
  altM: number;
  lat: number;
  lng: number;
  /** the track point it stands for (spec 1.129 §5.1: the profile selects a point) */
  section: number;
  index: number;
}

export interface ElevationProfile {
  points: ElevationPoint[];
  totalM: number;
  gainM: number;
  lossM: number;
  minM: number;
  maxM: number;
}

/** A point picked for the terrain lookup: its position in the sections and its (rounded) coordinate. */
export interface TerrainSample {
  section: number;
  index: number;
  lat: number;
  lng: number;
}

/** A point of a non-plane section with its distance from the start (plane sections are skipped, no distance across them). */
interface Walked {
  section: number;
  index: number;
  distM: number;
  point: TrackPoint;
}

function walk(sections: ElevationSection[]): Walked[] {
  const out: Walked[] = [];
  let dist = 0;
  let prev: TrackPoint | undefined;
  sections.forEach((s, section) => {
    if (s.mode === 'plane') {
      prev = undefined; // the flight is not part of the profile, and neither is its distance
      return;
    }
    s.points.forEach((point, index) => {
      if (prev) dist += distanceM(prev, point);
      prev = point;
      out.push({ section, index, distM: dist, point });
    });
  });
  return out;
}

/** A section's heights as a comma list of deltas in whole metres; an empty entry is a point without height. undefined = none. */
export function encodeAltitudes(points: Pick<TrackPoint, 'alt'>[]): string | undefined {
  if (!points.some((p) => p.alt !== undefined)) return undefined;
  let prev = 0;
  return points.map((p) => {
    if (p.alt === undefined) return '';
    const a = Math.round(p.alt);
    const d = a - prev;
    prev = a;
    return String(d);
  }).join(',');
}

/** The heights of `count` points; missing, extra or broken entries are undefined. */
export function decodeAltitudes(s: string | undefined, count: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(count).fill(undefined);
  if (!s) return out;
  let at = 0;
  s.split(',').slice(0, count).forEach((d, i) => {
    if (d === '') return;
    const n = Number(d);
    if (!Number.isFinite(n)) return;
    at += n;
    out[i] = at;
  });
  return out;
}

/** The points with the given heights set; a point without a height keeps what it had. */
export function withAltitudes(points: TrackPoint[], alts: (number | undefined)[]): TrackPoint[] {
  return points.map((p, i) => (alts[i] === undefined ? p : { ...p, alt: alts[i] }));
}

/** Share of the (non-plane) points that carry a height; 0 for a track without points. */
export function altitudeCoverage(sections: ElevationSection[]): number {
  const all = walk(sections);
  if (all.length === 0) return 0;
  return all.filter((w) => w.point.alt !== undefined).length / all.length;
}

/** Heights should come from the terrain model: too few points have a GPS altitude (spec §2). */
export function needsTerrain(sections: ElevationSection[]): boolean {
  return walk(sections).length > 1 && altitudeCoverage(sections) < ELEVATION_GPS_MIN_COVERAGE;
}

/**
 * The height-over-distance profile of the non-plane sections: heights averaged over ELEVATION_SMOOTH_WINDOW_M,
 * climb and descent counted in steps of at least ELEVATION_STEP_M. undefined below two points with a height.
 */
export function elevationProfile(sections: ElevationSection[]): ElevationProfile | undefined {
  const all = walk(sections);
  const raw = all.filter((w) => w.point.alt !== undefined);
  if (raw.length < 2) return undefined;
  const half = ELEVATION_SMOOTH_WINDOW_M / 2;
  const smoothed: number[] = [];
  let from = 0;
  let to = 0;
  let sum = 0;
  for (let i = 0; i < raw.length; i++) {
    while (to < raw.length && raw[to].distM <= raw[i].distM + half) sum += raw[to++].point.alt as number;
    while (raw[from].distM < raw[i].distM - half) sum -= raw[from++].point.alt as number;
    smoothed.push(sum / (to - from));
  }
  let gain = 0;
  let loss = 0;
  let ref = smoothed[0];
  for (const v of smoothed) {
    if (v - ref >= ELEVATION_STEP_M) {
      gain += v - ref;
      ref = v;
    } else if (ref - v >= ELEVATION_STEP_M) {
      loss += ref - v;
      ref = v;
    }
  }
  const points = raw.map((w, i) => ({
    distM: Math.round(w.distM), altM: Math.round(smoothed[i]), lat: w.point.lat, lng: w.point.lng, section: w.section, index: w.index,
  }));
  return {
    points,
    totalM: Math.round(all[all.length - 1].distM),
    gainM: Math.round(gain),
    lossM: Math.round(loss),
    minM: Math.min(...points.map((p) => p.altM)),
    maxM: Math.max(...points.map((p) => p.altM)),
  };
}

/** The profile is worth a chart: more than ELEVATION_MIN_RANGE_M between lowest and highest point. */
export function hasRelief(profile: ElevationProfile | undefined): profile is ElevationProfile {
  return !!profile && profile.maxM - profile.minM > ELEVATION_MIN_RANGE_M;
}

/** At most `max` profile points, evenly picked; first and last always stay. */
export function thinProfile(points: ElevationPoint[], max: number): ElevationPoint[] {
  if (points.length <= max || max < 2) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, k) => points[Math.round(k * step)]);
}

/**
 * Up to `max` points for the terrain lookup, evenly spread over the distance (first and last always), coordinates
 * rounded to 5 decimals (~1 m) so the same track asks the same question twice (gateway cache).
 */
export function terrainSamples(sections: ElevationSection[], max = TERRAIN_MAX_SAMPLES): TerrainSample[] {
  const all = walk(sections);
  if (all.length === 0) return [];
  let picked: Walked[];
  if (all.length <= max) {
    picked = all;
  } else {
    const total = all[all.length - 1].distM;
    picked = [];
    let j = 0;
    for (let k = 0; k < max; k++) {
      const target = (total * k) / (max - 1);
      while (j < all.length - 1 && all[j].distM < target) j++;
      if (picked[picked.length - 1] !== all[j]) picked.push(all[j]);
    }
    if (picked[picked.length - 1] !== all[all.length - 1]) picked.push(all[all.length - 1]);
  }
  const round = (v: number): number => Math.round(v * 1e5) / 1e5;
  return picked.map((w) => ({ section: w.section, index: w.index, lat: round(w.point.lat), lng: round(w.point.lng) }));
}

/**
 * The terrain heights per section and point: each non-plane point gets the height interpolated over the distance
 * between the samples that have one (clamped at both ends). Plane sections and a lookup without any height stay empty.
 */
export function terrainAltitudes(sections: ElevationSection[], samples: TerrainSample[], alts: (number | null)[]): (number | undefined)[][] {
  const out: (number | undefined)[][] = sections.map((s) => new Array(s.points.length).fill(undefined));
  const all = walk(sections);
  const distOf = new Map(all.map((w) => [`${w.section}:${w.index}`, w.distM]));
  const known = samples
    .map((s, i) => ({ distM: distOf.get(`${s.section}:${s.index}`), alt: alts[i] }))
    .filter((k): k is { distM: number; alt: number } => k.distM !== undefined && k.alt !== null && k.alt !== undefined && Number.isFinite(k.alt))
    .sort((a, b) => a.distM - b.distM);
  if (known.length === 0) return out;
  let j = 0;
  for (const w of all) {
    while (j < known.length - 1 && known[j + 1].distM <= w.distM) j++;
    const a = known[j];
    const b = known[Math.min(j + 1, known.length - 1)];
    let alt = a.alt;
    if (w.distM <= known[0].distM) alt = known[0].alt;
    else if (b !== a && b.distM > a.distM) alt = a.alt + ((b.alt - a.alt) * (w.distM - a.distM)) / (b.distM - a.distM);
    out[w.section][w.index] = Math.round(alt);
  }
  return out;
}

/** The sections with the heights to show: GPS as recorded, or — when the GPS heights are too sparse — the terrain heights. */
export function sectionsWithHeights<T extends ElevationSection>(sections: T[], terrain: (number | undefined)[][] | undefined): T[] {
  if (!terrain || !needsTerrain(sections)) return sections;
  return sections.map((s, i) => {
    const alts = terrain[i];
    if (!alts || alts.length !== s.points.length) return s;
    // terrain replaces the sparse GPS heights entirely: a mix of both would show jumps between the two sources
    return {
      ...s,
      points: s.points.map((p, k) => {
        const next: TrackPoint = { ...p };
        if (alts[k] === undefined) delete next.alt;
        else next.alt = alts[k];
        return next;
      }),
    };
  });
}

/** Request of the `getTerrainElevations` callable (spec 1.128 §5): 2–TERRAIN_MAX_SAMPLES points. */
export interface TerrainElevationsReq {
  points: { lat: number; lng: number }[];
}

/** Response of `getTerrainElevations`: one height per requested point (null = the model has none there). */
export interface TerrainElevationsRes {
  alts: (number | null)[];
  attribution: { provider: string; url: string };
}
