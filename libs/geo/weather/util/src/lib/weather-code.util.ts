import { WeatherCode } from '@okr/shared-models';

/** Icon set (Storage subfolder `logo/weather`) — the second argument of the `svgIcon` pipe. */
export const WEATHER_ICON_SET = 'weather';

/** The icon names available in the `weather` set. */
export type WeatherIconName =
  'sunny' | 'clear-night' | 'partly-cloudy' | 'partly-cloudy-night' |
  'cloudy' | 'fog' | 'rain' | 'snow' | 'thunderstorm' | 'windy';

/**
 * Maps a WMO weather interpretation code to an icon of the `weather` set.
 *
 * `windy` is deliberately NOT reachable from here. The WMO codes describe cloud cover and
 * precipitation, never wind, so there is no code that means "windy" — and overriding a
 * precipitation icon with a wind one would hide the more important information. Wind is shown
 * as a number in `forecast_detail` and `hourly_detail` instead. `windy.svg` stays in the set
 * unused; `weather-code.util.spec.ts` pins that this function never returns it.
 *
 * @param code  WMO code, 0-99.
 * @param isDay `is_day` from the provider — picks the night variant for clear/partly-cloudy.
 */
export function weatherCodeToIcon(code: WeatherCode, isDay = true): WeatherIconName {
  if (code === 0) return isDay ? 'sunny' : 'clear-night';
  if (code === 1 || code === 2) return isDay ? 'partly-cloudy' : 'partly-cloudy-night';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 95) return 'thunderstorm';                       // 95, 96, 99
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  // Unknown or unmapped code: stay neutral rather than guessing a condition.
  return 'cloudy';
}
