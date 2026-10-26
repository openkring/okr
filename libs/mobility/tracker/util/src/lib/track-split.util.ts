import type { TrackPoint } from './track-polyline.util';
import { distanceM } from './track-summary.util';

/** The rowers' split distance (spec 1.122 §5.3). */
export const SPLIT_DISTANCE_M = 500;
/** A stretch slower than this … */
export const SPLIT_PAUSE_SPEED_MPS = 1;
/** … for longer than this is a pause and is left out of the average split. */
export const SPLIT_PAUSE_MIN_MS = 10_000;
/** The live split averages the GPS speed over this window. */
export const LIVE_SPLIT_WINDOW_MS = 10_000;

const round1 = (v: number): number => Math.round(v * 10) / 10;

/**
 * Average and best split of a row section, in seconds per 500 m (rounded to 0.1 s).
 * - average: moving time × 500 / distance; runs of consecutive segments slower than 1 m/s that last more than 10 s
 *   (a break at the dock) are left out of the moving time.
 * - best: the fastest continuous 500 m, window ends interpolated in time; absent below 500 m.
 * Fewer than two points or no distance → {}.
 */
export function rowSplits(points: TrackPoint[]): { splitAvgS?: number; splitBestS?: number } {
  if (points.length < 2) return {};
  const cum: number[] = [0];
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + distanceM(points[i - 1], points[i]));
  const total = cum[cum.length - 1];
  if (total < 1) return {};

  let movingMs = 0;
  let slowRunMs = 0;
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].t - points[i - 1].t;
    if (dt <= 0) continue;
    const slow = ((cum[i] - cum[i - 1]) / dt) * 1000 < SPLIT_PAUSE_SPEED_MPS;
    if (slow) {
      slowRunMs += dt;
    } else {
      if (slowRunMs <= SPLIT_PAUSE_MIN_MS) movingMs += slowRunMs;
      slowRunMs = 0;
      movingMs += dt;
    }
  }
  if (slowRunMs <= SPLIT_PAUSE_MIN_MS) movingMs += slowRunMs;

  const result: { splitAvgS?: number; splitBestS?: number } = {};
  if (movingMs > 0) result.splitAvgS = round1(((movingMs / 1000) * SPLIT_DISTANCE_M) / total);
  const best = bestWindowMs(points, cum);
  if (best !== undefined) result.splitBestS = round1(best / 1000);
  return result;
}

/** Time at cumulative distance `d`, interpolated linearly between the bracketing points (j-1, j). */
function timeAt(points: TrackPoint[], cum: number[], j: number, d: number): number {
  const span = cum[j] - cum[j - 1];
  const f = span > 0 ? (d - cum[j - 1]) / span : 1;
  return points[j - 1].t + f * (points[j].t - points[j - 1].t);
}

/** Shortest time for any continuous 500 m: windows starting at a point and windows ending at a point. */
function bestWindowMs(points: TrackPoint[], cum: number[]): number | undefined {
  const total = cum[cum.length - 1];
  if (total < SPLIT_DISTANCE_M) return undefined;
  let best = Infinity;
  let j = 1;
  for (let i = 0; i < points.length && cum[i] + SPLIT_DISTANCE_M <= total; i++) {
    const target = cum[i] + SPLIT_DISTANCE_M;
    while (cum[j] < target) j++;
    best = Math.min(best, timeAt(points, cum, j, target) - points[i].t);
  }
  let k = 1;
  for (let e = 0; e < points.length; e++) {
    const target = cum[e] - SPLIT_DISTANCE_M;
    if (target < 0) continue;
    while (cum[k] < target) k++;
    best = Math.min(best, points[e].t - timeAt(points, cum, k, target));
  }
  return Number.isFinite(best) ? best : undefined;
}

/** The current split from the GPS speeds of the last 10 s; undefined below 1 m/s or without usable fixes. */
export function liveSplitS(fixes: { speed: number | null; time: number }[], nowMs: number): number | undefined {
  const speeds = fixes
    .filter((f) => f.speed !== null && f.time >= nowMs - LIVE_SPLIT_WINDOW_MS && f.time <= nowMs)
    .map((f) => f.speed as number);
  if (speeds.length === 0) return undefined;
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  return mean < SPLIT_PAUSE_SPEED_MPS ? undefined : round1(SPLIT_DISTANCE_M / mean);
}
