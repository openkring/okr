import type { StrokeSample } from './stroke-detector';

/** Gaps longer than this are breaks and are left out of the average stroke rate (spec 1.122 §5.2). */
export const STROKE_PAUSE_MS = 10_000;
/** The maximum stroke rate is the highest over any window this long … */
export const STROKE_RATE_WINDOW_MS = 30_000;
/** … that holds at least this many strokes. */
export const STROKE_RATE_MIN_STROKES = 5;

const round1 = (v: number): number => Math.round(v * 10) / 10;

/** strokes, average rate (breaks excluded) and maximum rate (30 s windows) of a section's stroke times. */
export function strokeFigures(times: number[]): { strokes?: number; strokeRateAvg?: number; strokeRateMax?: number } {
  if (times.length === 0) return {};
  const t = [...times].sort((a, b) => a - b);
  const out: { strokes?: number; strokeRateAvg?: number; strokeRateMax?: number } = { strokes: t.length };
  let gaps = 0;
  let rowingMs = 0;
  for (let i = 1; i < t.length; i++) {
    const g = t[i] - t[i - 1];
    if (g > 0 && g <= STROKE_PAUSE_MS) { gaps++; rowingMs += g; }
  }
  if (gaps > 0) out.strokeRateAvg = round1((gaps / rowingMs) * 60_000);
  let best = 0;
  let j = 0;
  for (let i = 0; i < t.length; i++) {
    if (j < i) j = i;
    while (j + 1 < t.length && t[j + 1] - t[i] <= STROKE_RATE_WINDOW_MS) j++;
    if (j - i + 1 >= STROKE_RATE_MIN_STROKES && t[j] > t[i]) best = Math.max(best, ((j - i) / (t[j] - t[i])) * 60_000);
  }
  if (best > 0) out.strokeRateMax = round1(best);
  return out;
}

/** Stroke times as comma-separated ms deltas, the first relative to `startMs` (the section's first point). */
export function encodeStrokeTimes(times: number[], startMs: number): string {
  let prev = startMs;
  return [...times].sort((a, b) => a - b).map((x) => {
    const d = Math.round(x - prev);
    prev += d;
    return d;
  }).join(',');
}

export function decodeStrokeTimes(s: string | undefined, startMs: number): number[] {
  if (!s) return [];
  let at = startMs;
  return s.split(',').map((d) => (at += Number(d)));
}

/** The rows of a calibration CSV (`t_ms,ax,ay,az,gps_speed`, spec 1.122 §5.2) as detector samples; broken lines are skipped. */
export function parseCalibrationCsv(text: string): StrokeSample[] {
  const out: StrokeSample[] = [];
  for (const line of text.split('\n').slice(1)) {
    const f = line.split(',');
    if (f.length < 5) continue;
    const [t, ax, ay, az] = f.slice(0, 4).map(Number);
    if (![t, ax, ay, az].every(Number.isFinite) || f[0] === '') continue;
    out.push({ t, ax, ay, az, speed: f[4].trim() === '' ? null : Number(f[4]) });
  }
  return out;
}

/**
 * The base time stroke times are delta-encoded against: the section's first point at whole seconds — the precision
 * the polyline keeps (encodeTrack), so upload and read-back use the same base. 0 without points.
 */
export function strokeTimesBase(points: { t: number }[]): number {
  return points.length > 0 ? Math.round(points[0].t / 1000) * 1000 : 0;
}
