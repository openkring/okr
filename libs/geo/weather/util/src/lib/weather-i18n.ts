import { Signal } from '@angular/core';

/**
 * Keys live here (util), the translations live in the lib that renders them
 * (`libs/geo/weather/ui/src/i18n/*.json`), so the prefix must mirror THAT path —
 * a mismatch 404s at runtime and no build notices.
 */
const PFX = '@geo/weather/ui.';

export const WEATHER_I18N_KEYS = {
  today:                    PFX + 'today',
  empty:                    PFX + 'empty',
  stale:                    PFX + 'stale',
  source:                   PFX + 'source',

  uncertainty:              PFX + 'uncertainty',
  sunshine:                 PFX + 'sunshine',
  sunshine_duration:        PFX + 'sunshine.duration',
  wind_and_gusts:           PFX + 'wind.andGusts',
  wind_from:                PFX + 'wind.from',
  precipitation:            PFX + 'precipitation.label',
  precipitation_prob:       PFX + 'precipitation.probability',
  local_forecast:           PFX + 'localForecast',
  elevation:                PFX + 'elevation',

  radar_measured:           PFX + 'radar.measured',
  radar_forecast:           PFX + 'radar.forecast',
  radar_play:               PFX + 'radar.play',
  radar_pause:              PFX + 'radar.pause',
  radar_degraded:           PFX + 'radar.degraded',

  dir_n:                    PFX + 'direction.n',
  dir_ne:                   PFX + 'direction.ne',
  dir_e:                    PFX + 'direction.e',
  dir_se:                   PFX + 'direction.se',
  dir_s:                    PFX + 'direction.s',
  dir_sw:                   PFX + 'direction.sw',
  dir_w:                    PFX + 'direction.w',
  dir_nw:                   PFX + 'direction.nw',
} as const;

export type WeatherI18nKey = keyof typeof WEATHER_I18N_KEYS;

/** Resolved labels, as produced by `I18nService.translateAll` and passed down as `[i18n]`. */
export type WeatherI18n = Record<WeatherI18nKey, Signal<string>>;

/** Compass index (0-7, see `windDirectionIndex`) to its i18n key. */
export const WIND_DIRECTION_KEYS = [
  WEATHER_I18N_KEYS.dir_n, WEATHER_I18N_KEYS.dir_ne, WEATHER_I18N_KEYS.dir_e, WEATHER_I18N_KEYS.dir_se,
  WEATHER_I18N_KEYS.dir_s, WEATHER_I18N_KEYS.dir_sw, WEATHER_I18N_KEYS.dir_w, WEATHER_I18N_KEYS.dir_nw,
] as const;
