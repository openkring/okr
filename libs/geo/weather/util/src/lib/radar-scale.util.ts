/**
 * Colour scale of the MeteoSwiss precipitation radar (spec 1.110).
 *
 * Shared by the Cloud Function that paints the PNG frames and by the `rain_radar` legend, so the
 * legend can never drift from the picture. Pure data: this file is bundled into the functions and
 * must not import anything Angular.
 *
 * Each step colours every rate from its `min` (inclusive) up to the next step's `min`. Rates below
 * the first step are dry and stay transparent — the radar reports tiny values (0.07 mm/h) for
 * clutter and drizzle that would otherwise tint the whole map.
 */
export interface RadarScaleStep {
  min: number;    // mm/h, inclusive lower bound
  color: string;  // #rrggbb
}

export const RADAR_SCALE: readonly RadarScaleStep[] = [
  { min: 0.1, color: '#88ddee' },
  { min: 0.5, color: '#0099cc' },
  { min: 1, color: '#0077aa' },
  { min: 2, color: '#005588' },
  { min: 4, color: '#ffee00' },
  { min: 10, color: '#ffaa00' },
  { min: 20, color: '#ff4400' },
  { min: 50, color: '#c10000' },
  { min: 100, color: '#ffaaff' },
];

/**
 * Index into `RADAR_SCALE` for a rain rate, or -1 for dry / no data (NaN, outside the radar range).
 */
export function radarScaleIndex(rate: number, scale: readonly RadarScaleStep[] = RADAR_SCALE): number {
  if (!Number.isFinite(rate)) return -1;
  let index = -1;
  for (let i = 0; i < scale.length; i++) {
    if (rate >= scale[i].min) index = i; else break;
  }
  return index;
}

/** `#rrggbb` → [r, g, b]. */
export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** CSS gradient for the legend ramp, built from the same steps the PNGs are painted with. */
export function radarScaleGradient(scale: readonly RadarScaleStep[] = RADAR_SCALE): string {
  return `linear-gradient(90deg, ${scale.map((s) => s.color).join(', ')})`;
}
