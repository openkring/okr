import { DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TENANTS } from '@okr/shared-constants';
import { OkrModel, SearchableModel } from './base.model';

/**
 * WMO weather interpretation code as delivered by the provider (Open-Meteo).
 * 0 clear · 1-3 cloud cover · 45/48 fog · 51-67 drizzle/rain · 71-77 snow ·
 * 80-86 showers · 95-99 thunderstorm. Mapped to an icon by `weatherCodeToIcon`
 * in `@okr/geo-weather-util`.
 */
export type WeatherCode = number;

/** Aggregated values for one day. */
export interface WeatherDaily {
  code: WeatherCode;
  tempMin: number;          // °C
  tempMax: number;          // °C
  precipitation: number;    // mm, sum over the day
  precipitationMin: number; // mm, lower bound of the provider's range
  precipitationMax: number; // mm, upper bound
  precipitationProbability: number; // %, max over the day
  windMax: number;          // km/h, mean wind
  gustsMax: number;         // km/h, peak gust
  sunshineMinutes: number;  // minutes over the day
  sunrise: string;          // DateFormat.Time (HH:mm), local wall clock
  sunset: string;           // DateFormat.Time (HH:mm)
}

/** One hour of the forecast. `time` is the hour's start, local wall clock. */
export interface WeatherHour {
  time: string;             // DateFormat.Time (HH:mm), start of the hour
  code: WeatherCode;
  isDay: boolean;           // drives the day/night icon variant
  temp: number;             // °C
  tempMin: number;          // °C, lower bound (ensemble spread)
  tempMax: number;          // °C, upper bound
  precipitation: number;    // mm/h
  precipitationMin: number; // mm/h
  precipitationMax: number; // mm/h
  precipitationProbability: number; // %
  wind: number;             // km/h
  windMin: number;          // km/h
  windMax: number;          // km/h
  windDirection: number;    // degrees, 0 = from north
  gusts: number;            // km/h
  sunshineMinutes: number;  // minutes within this hour
}

/**
 * One weather document per location and day (`okey` = `<locationKey>-<date>`).
 *
 * Forecast days are overwritten on every fetch. Once the day has passed the next run
 * flips `isForecast` to false and the document freezes — the archive is a by-product
 * of fetching, not a second mechanism.
 */
export class WeatherModel implements OkrModel, SearchableModel {
  public okey = DEFAULT_KEY;   // `${locationKey}-${date}`, e.g. 'aB3xY-20260829'
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public locationKey = DEFAULT_KEY;  // FK -> locations
  public date = '';                  // StoreDate (yyyyMMdd), local wall clock
  public fetchedAt = '';             // StoreDateTime of the last successful fetch
  public provider = 'open-meteo';
  public isForecast = true;          // false once the day is over
  public daily: WeatherDaily = {
    code: 0, tempMin: 0, tempMax: 0,
    precipitation: 0, precipitationMin: 0, precipitationMax: 0, precipitationProbability: 0,
    windMax: 0, gustsMax: 0, sunshineMinutes: 0, sunrise: '', sunset: ''
  };
  public hourly: WeatherHour[] = [];
  public notes = DEFAULT_NOTES;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const WeatherCollection = 'weather';
export const WeatherModelName = 'weather';

/** Document id for a location/day pair (`date` is a StoreDate, yyyyMMdd). Keep in sync with the Cloud Function. */
export function weatherKey(locationKey: string, date: string): string {
  return `${locationKey}-${date}`;
}
