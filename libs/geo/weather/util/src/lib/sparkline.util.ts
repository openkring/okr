/** A point on the sparkline, in viewBox units. */
export interface SparkPoint { x: number; y: number; }

/**
 * Maps a series of values onto an SVG polyline path.
 *
 * The scale is derived from the series itself, padded by `pad` units top and bottom so the
 * extremes do not touch the frame. A flat series (every value equal) would divide by zero,
 * so it is centred instead — that case is real: a whole day at the same temperature after
 * rounding, or a series of zeros.
 */
export function buildSparklinePath(values: number[], width: number, height: number, pad = 6): string {
  const points = sparklinePoints(values, width, height, pad);
  if (!points.length) return '';
  return 'M' + points.map((p) => `${p.x},${p.y}`).join(' L');
}

export function sparklinePoints(values: number[], width: number, height: number, pad = 6): SparkPoint[] {
  if (values.length === 0) return [];
  if (values.length === 1) return [{ x: width / 2, y: height / 2 }];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const top = pad;
  const usable = Math.max(0, height - pad * 2);

  return values.map((value, i) => ({
    x: Math.round((i / (values.length - 1)) * width * 10) / 10,
    // span === 0 ⇒ a flat line through the middle, not a division by zero
    y: Math.round((span === 0 ? height / 2 : top + (1 - (value - min) / span) * usable) * 10) / 10,
  }));
}
