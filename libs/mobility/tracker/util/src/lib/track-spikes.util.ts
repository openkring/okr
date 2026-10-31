import type { TransportMode } from '@okr/shared-models';
import type { TrackPoint } from './track-polyline.util';
import { distanceM } from './track-summary.util';

/**
 * Highest plausible speed per mode (m/s, spec 1.129 §3.1). A spike needs at least one leg above it; undefined = the
 * mode is never filtered (a plane has no ground track worth checking).
 */
export const SPIKE_SPEED_MPS: Record<TransportMode, number | undefined> = {
  foot: 7, bike: 25, ski: 25, row: 25, car: 60, motorbike: 60, bus: 60, train: 90, ship: 30, plane: undefined,
};
/** A spike is at most this many points … */
export const SPIKE_MAX_POINTS = 8;
/** … taken within this time (first to last point of the run). */
export const SPIKE_MAX_SPAN_MS = 120_000;
/** The run leaves the track by more than this … */
export const SPIKE_MIN_EXCURSION_M = 200;
/** … and comes back: the points before and after it are at most excursion / SPIKE_RETURN_RATIO apart. */
export const SPIKE_RETURN_RATIO = 4;
/** The manual «Ausreisser entfernen» (spec §5.2) also takes smaller detours. */
export const SPIKE_MANUAL_MIN_EXCURSION_M = 50;

/** An inclusive range of point indices. */
export interface PointRun { start: number; end: number }

/** The leg a → b is faster than `limit` (two fixes at the same second count as fast when they are apart). */
function fast(a: TrackPoint, b: TrackPoint, limit: number): boolean {
  const dt = (b.t - a.t) / 1000;
  const d = distanceM(a, b);
  return dt <= 0 ? d > 0 : d / dt > limit;
}

/**
 * Points `start..end` form an out-and-back detour between `start - 1` and `end + 1`: within SPIKE_MAX_SPAN_MS, every
 * point away from both neighbours by more than half of `minExcursion`, the farthest by more than `minExcursion`, and
 * the neighbours close together. With `limit`, one leg from
 * `start - 1` to `end + 1` must also be faster than it.
 */
function isDetour(points: TrackPoint[], start: number, end: number, minExcursion: number, limit?: number): boolean {
  const a = points[start - 1];
  const b = points[end + 1];
  if (!a || !b || end < start || end - start + 1 > SPIKE_MAX_POINTS) return false;
  if (points[end].t - points[start].t > SPIKE_MAX_SPAN_MS) return false;
  let excursion = 0;
  for (let k = start; k <= end; k++) {
    const off = Math.min(distanceM(a, points[k]), distanceM(points[k], b));
    if (off <= minExcursion / 2) return false; // every point of the run is off — a good point next to a spike stays
    excursion = Math.max(excursion, off);
  }
  if (excursion <= minExcursion || distanceM(a, b) > excursion / SPIKE_RETURN_RATIO) return false;
  if (limit === undefined) return true;
  for (let k = start - 1; k <= end; k++) if (fast(points[k], points[k + 1], limit)) return true;
  return false;
}

/** The shortest detour anywhere in `points` (fewest points first, then the earliest); undefined when there is none. */
function shortestDetour(points: TrackPoint[], limit: number): PointRun | undefined {
  for (let len = 1; len <= SPIKE_MAX_POINTS; len++) {
    for (let start = 1; start + len - 1 <= points.length - 2; start++) {
      if (isDetour(points, start, start + len - 1, SPIKE_MIN_EXCURSION_M, limit)) return { start, end: start + len - 1 };
    }
  }
  return undefined;
}

/**
 * The GPS spikes of a section (spec 1.129 §3): out-and-back runs of up to SPIKE_MAX_POINTS points with a leg faster
 * than the mode allows. The shortest detour goes first and the search repeats on what is left: a single bad fix
 * between good points 100 m apart (a train) must not take its neighbours along in a longer run that also fits.
 * The first and the last point are never part of a run. Runs are in original indices, ascending and disjoint.
 */
export function findSpikeRuns(points: TrackPoint[], mode: TransportMode): PointRun[] {
  const limit = SPIKE_SPEED_MPS[mode];
  if (limit === undefined || points.length < 3) return [];
  const left = points.map((_, k) => k); // original indices of the points still in
  const dropped: number[] = [];
  for (;;) {
    const run = shortestDetour(left.map((k) => points[k]), limit);
    if (!run) break;
    dropped.push(...left.splice(run.start, run.end - run.start + 1));
  }
  dropped.sort((a, b) => a - b);
  const runs: PointRun[] = [];
  for (const k of dropped) {
    const last = runs[runs.length - 1];
    if (last && last.end === k - 1) last.end = k;
    else runs.push({ start: k, end: k });
  }
  return runs;
}

/** Indices of the points that are no spike, ascending (all of them when nothing is found). */
export function spikeFreeIndices(points: TrackPoint[], mode: TransportMode): number[] {
  const runs = findSpikeRuns(points, mode);
  const keep: number[] = [];
  let r = 0;
  for (let k = 0; k < points.length; k++) {
    while (r < runs.length && runs[r].end < k) r++;
    if (r < runs.length && runs[r].start <= k) continue;
    keep.push(k);
  }
  return keep;
}

/** The section without its GPS spikes; the same array when there are none. */
export function dropGpsSpikes(points: TrackPoint[], mode: TransportMode): TrackPoint[] {
  const keep = spikeFreeIndices(points, mode);
  return keep.length === points.length ? points : keep.map((k) => points[k]);
}

/** `values` at the kept indices; undefined stays undefined (a parallel array, e.g. terrain heights). */
export function pickIndices<T>(values: T[] | undefined, keep: number[]): T[] | undefined {
  return values === undefined ? undefined : keep.map((k) => values[k]);
}

/**
 * The detour around point `index` for the manual «Ausreisser entfernen» (spec 1.129 §5.2): the shortest run that
 * contains it and goes out and back by more than SPIKE_MANUAL_MIN_EXCURSION_M, without a speed condition.
 * Undefined when there is none.
 */
export function spikeRunAround(points: TrackPoint[], index: number): PointRun | undefined {
  if (!Number.isInteger(index) || index < 1 || index > points.length - 2) return undefined;
  for (let len = 1; len <= SPIKE_MAX_POINTS; len++) {
    for (let start = Math.max(1, index - len + 1); start <= index; start++) {
      const end = start + len - 1;
      if (end > points.length - 2) break;
      if (isDetour(points, start, end, SPIKE_MANUAL_MIN_EXCURSION_M)) return { start, end };
    }
  }
  return undefined;
}
