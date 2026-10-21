/** A value axis: its visible range and the round values that get a grid line and a label. */
export interface AxisScale { min: number; max: number; ticks: number[]; }

/**
 * A "nice" axis over `[min, max]`: the step is 1, 2, 2.5 or 5 times a power of ten, and the
 * range is widened outwards to whole steps so the outer grid lines carry round labels too.
 *
 * `minSpan` keeps a nearly flat series (a calm day, 0.1 mm of rain) from being blown up to
 * full height — a 2 km/h wiggle must not look like a storm.
 */
export function niceScale(min: number, max: number, maxTicks = 4, minSpan = 1): AxisScale {
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : lo + minSpan;
  if (hi < lo) [lo, hi] = [hi, lo];
  if (hi - lo < minSpan) {
    // grow upwards from a zero floor (rain, wind), symmetrically otherwise (temperature)
    if (lo === 0) { hi = minSpan; } else { const mid = (lo + hi) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  }

  const rough = (hi - lo) / Math.max(1, maxTicks - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * magnitude).find((s) => s >= rough) ?? 10 * magnitude;

  const first = Math.floor(lo / step) * step;
  const last = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = first; v <= last + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return { min: ticks[0], max: ticks[ticks.length - 1], ticks };
}

/** Hour steps that divide a day evenly, so samples land on the same clock hours every day. */
const HOUR_STEPS = [1, 2, 3, 4, 6, 8, 12, 24];

/**
 * How many hours one cell has to cover so that `hours` cells fit into `widthPx` with each
 * at least `minCellPx` wide. Used to thin out the icon strip, the hour labels and the bars.
 */
export function hourStep(hours: number, widthPx: number, minCellPx: number): number {
  if (hours <= 0 || widthPx <= 0) return 1;
  const needed = (hours * minCellPx) / widthPx;
  return HOUR_STEPS.find((s) => s >= needed) ?? 24;
}
