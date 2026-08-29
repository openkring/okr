/**
 * Formatters shared by the weather widgets. All of them return display strings only —
 * nothing here is parsed back, so rounding is safe.
 */

/** `19°`. Rounds to whole degrees, the precision every widget shows. */
export function formatTemp(celsius: number): string {
  return `${Math.round(celsius)}°`;
}

/**
 * `0 mm` · `< 1 mm` · `14 mm`.
 *
 * A trace amount must not render as `0 mm` — "no rain" and "barely any rain" are different
 * answers to the only question this number is asked.
 */
export function formatPrecipitation(mm: number): string {
  if (mm <= 0) return '0 mm';
  if (mm < 1) return '< 1 mm';
  return `${Math.round(mm)} mm`;
}

/** `0 – 6 mm` — the provider's lower/upper bound, shown under the expected value. */
export function formatPrecipitationRange(min: number, max: number): string {
  return `${Math.round(Math.max(0, min))} – ${Math.round(Math.max(0, max))} mm`;
}

/** `0 mm/h` · `< 1 mm/h` · `3 mm/h` — the hourly rate in `hourly_detail`. */
export function formatPrecipitationRate(mmPerHour: number): string {
  if (mmPerHour <= 0) return '0 mm/h';
  if (mmPerHour < 1) return '< 1 mm/h';
  return `${Math.round(mmPerHour)} mm/h`;
}

/** `6.7 km/h`. One decimal — wind differences below that are noise. */
export function formatWind(kmh: number): string {
  return `${(Math.round(kmh * 10) / 10).toFixed(1)} km/h`;
}

/** `50 min/h` — sunshine duration within one hour. */
export function formatSunshine(minutes: number): string {
  return `${Math.round(minutes)} min/h`;
}

/**
 * Index 0-7 into the eight compass points, starting at north and going clockwise:
 * N, NE, E, SE, S, SW, W, NW. The caller turns it into a label via i18n — the direction
 * names are translated, so no string is built here.
 *
 * The provider reports the direction the wind blows FROM, which is what the label says too.
 */
export function windDirectionIndex(degrees: number): number {
  const normalized = ((degrees % 360) + 360) % 360;
  return Math.round(normalized / 45) % 8;
}
