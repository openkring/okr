// apps/functions/src/diary/weather.ts
import { DEFAULT_DIARY_WEATHER, type DiaryWeather } from '@okr/shared-models';
import { addDuration, convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

/**
 * Open-Meteo splits its history across two hosts at roughly one year: older days are reanalysis
 * (`archive-api`), newer ones are the retained forecast (`historical-forecast-api`). The boundary
 * is relative to TODAY, so it moves — hardcoding the date it happened to have when this was
 * written would silently send this year's entries to the wrong host.
 */
const ARCHIVE_HOST = 'https://archive-api.open-meteo.com/v1/archive';
const FORECAST_HOST = 'https://historical-forecast-api.open-meteo.com/v1/forecast';
const DAILY = 'weather_code,temperature_2m_min,temperature_2m_max,precipitation_sum,sunrise,sunset';

/** One Open-Meteo range request for a single coordinate, on one side of the archive/forecast split. */
export interface WeatherRange {
  latitude: number;
  longitude: number;
  startDate: string;
  endDate: string;
  api: 'archive' | 'forecast';
}

interface DatedCoord {
  date: string;
  latitude: number;
  longitude: number;
}

/** Groups entries by exact coordinate pair, preserving first-seen order. */
function groupByCoordinate(entries: DatedCoord[]): Map<string, DatedCoord[]> {
  const groups = new Map<string, DatedCoord[]>();
  for (const entry of entries) {
    const key = `${entry.latitude},${entry.longitude}`;
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }
  return groups;
}

function toIsoDate(storeDate: string): string {
  return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.IsoDate);
}

/**
 * Groups entries by coordinate and emits one range per place spanning its earliest to latest
 * date — or two ranges when the place's dates straddle the archive/forecast boundary (`today`
 * minus one year). Entries without coordinates were already filtered out by the caller (an
 * unresolved place has no `{ latitude, longitude }` to pass in), so this stays pure and cheap:
 * ~50 ranges instead of one call per diary entry.
 */
export function planWeatherRanges(entries: DatedCoord[], today: string): WeatherRange[] {
  // date-fns' add() accepts negative durations, so this correctly computes "one year ago" —
  // subDuration is not used here: its implementation calls add() instead of sub() and would
  // move the boundary the wrong direction.
  const boundary = addDuration(today, { years: -1 }, DateFormat.StoreDate);
  const ranges: WeatherRange[] = [];

  for (const group of groupByCoordinate(entries).values()) {
    const { latitude, longitude } = group[0];
    const dates = group.map((e) => e.date).sort();
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const archiveDates = dates.filter((d) => d < boundary);
    const forecastDates = dates.filter((d) => d >= boundary);

    if (archiveDates.length > 0 && forecastDates.length > 0) {
      ranges.push({
        latitude, longitude, api: 'archive',
        startDate: toIsoDate(minDate), endDate: toIsoDate(archiveDates[archiveDates.length - 1]),
      });
      ranges.push({
        latitude, longitude, api: 'forecast',
        startDate: toIsoDate(forecastDates[0]), endDate: toIsoDate(maxDate),
      });
    } else {
      ranges.push({
        latitude, longitude,
        api: archiveDates.length > 0 ? 'archive' : 'forecast',
        startDate: toIsoDate(minDate), endDate: toIsoDate(maxDate),
      });
    }
  }

  return ranges;
}

/**
 * The file is the historical record: `code` always comes from the API (the archive only ever
 * carried a rendered emoji line, which does not map back to a single WMO code — so a file can
 * never supply it), and every other field is taken from the API only where the file has none.
 * Where file and API disagree, the file stands; that disagreement is a run-report concern, not
 * something this function resolves.
 */
export function mergeWeather(fromFile: DiaryWeather, fromApi: Partial<DiaryWeather>): DiaryWeather {
  return {
    code: fromApi.code ?? -1,
    min: fromFile.min !== DEFAULT_DIARY_WEATHER.min ? fromFile.min : (fromApi.min ?? fromFile.min),
    max: fromFile.max !== DEFAULT_DIARY_WEATHER.max ? fromFile.max : (fromApi.max ?? fromFile.max),
    precip: fromFile.precip !== DEFAULT_DIARY_WEATHER.precip ? fromFile.precip : (fromApi.precip ?? fromFile.precip),
    sunrise: fromFile.sunrise !== DEFAULT_DIARY_WEATHER.sunrise ? fromFile.sunrise : (fromApi.sunrise ?? fromFile.sunrise),
    sunset: fromFile.sunset !== DEFAULT_DIARY_WEATHER.sunset ? fromFile.sunset : (fromApi.sunset ?? fromFile.sunset),
  };
}

interface OpenMeteoDailyResponse {
  daily?: {
    time: string[];
    weather_code?: number[];
    temperature_2m_min?: number[];
    temperature_2m_max?: number[];
    precipitation_sum?: number[];
    sunrise?: string[];
    sunset?: string[];
  };
}

/**
 * Extracts the local 'HH:mm' clock time from an Open-Meteo ISO datetime, e.g. '2026-08-23T07:40'.
 * Open-Meteo omits seconds; DateFormat.IsoDateTime requires them, so a missing ':ss' is padded
 * before the conversion rather than inventing a second, seconds-less ISO format constant.
 */
function toLocalTime(isoDateTime: string | undefined): string {
  if (!isoDateTime) return '';
  const withSeconds = isoDateTime.length === 16 ? `${isoDateTime}:00` : isoDateTime;
  return convertDateFormatToString(withSeconds, DateFormat.IsoDateTime, DateFormat.Time, false);
}

/**
 * Fetches one range from Open-Meteo and returns its daily measurements keyed by `yyyyMMdd`.
 * Never throws and never guesses: any non-OK response (rate limit, bad coordinate, outage)
 * yields an empty Map, leaving every date's weather at DEFAULT_DIARY_WEATHER.
 */
export async function fetchWeatherRange(range: WeatherRange): Promise<Map<string, Partial<DiaryWeather>>> {
  const host = range.api === 'archive' ? ARCHIVE_HOST : FORECAST_HOST;
  const url = `${host}?latitude=${range.latitude}&longitude=${range.longitude}` +
    `&start_date=${range.startDate}&end_date=${range.endDate}&daily=${DAILY}&timezone=auto`;

  const result = new Map<string, Partial<DiaryWeather>>();

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return result;
  }
  if (!response.ok) {
    return result;
  }

  const body = (await response.json()) as OpenMeteoDailyResponse;
  const daily = body.daily;
  if (!daily?.time) {
    return result;
  }

  daily.time.forEach((isoDate, i) => {
    const storeDate = convertDateFormatToString(isoDate, DateFormat.IsoDate, DateFormat.StoreDate);
    result.set(storeDate, {
      code: daily.weather_code?.[i],
      min: daily.temperature_2m_min?.[i],
      max: daily.temperature_2m_max?.[i],
      precip: daily.precipitation_sum?.[i],
      sunrise: toLocalTime(daily.sunrise?.[i]),
      sunset: toLocalTime(daily.sunset?.[i]),
    });
  });

  return result;
}
