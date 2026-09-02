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

/** True only for a real 'yyyyMMdd' day — rejects the zeroed dates of month/year aggregates. */
function isCalendarDay(storeDate: string): boolean {
  if (!/^\d{8}$/.test(storeDate)) {
    return false;
  }
  const y = Number(storeDate.slice(0, 4));
  const m = Number(storeDate.slice(4, 6));
  const d = Number(storeDate.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  return m >= 1 && m <= 12 && d >= 1
    && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
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
  // Drop anything that is not a real calendar day. A range spans a coordinate group's MIN to MAX
  // date, so a single zeroed date ('19900000', how a month/year aggregate is stored — see
  // DiaryScope) would push that group's range start to '1990-00-00', Open-Meteo would reject the
  // call, and every day sharing those coordinates would silently lose its measured weather. The
  // caller already filters by scope; this makes the failure impossible rather than merely absent.
  entries = entries.filter((e) => isCalendarDay(e.date));

  // date-fns' add() accepts negative durations, so this correctly computes "one year ago" —
  // subDuration is not used here: its implementation calls add() instead of sub() and would
  // move the boundary the wrong direction.
  const boundary = addDuration(today, { years: -1 }, DateFormat.StoreDate);
  const ranges: WeatherRange[] = [];

  for (const group of groupByCoordinate(entries).values()) {
    const { latitude, longitude } = group[0];
    // Fixed-width yyyyMMdd strings sort correctly under plain lexicographic comparison; the
    // explicit comparator only spells that out for the linter.
    const dates = group.map((e) => e.date).sort((a, b) => a.localeCompare(b));
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    const archiveDates = dates.filter((d) => d < boundary);
    const forecastDates = dates.filter((d) => d >= boundary);

    if (archiveDates.length > 0 && forecastDates.length > 0) {
      ranges.push(
        {
          latitude, longitude, api: 'archive',
          startDate: toIsoDate(minDate), endDate: toIsoDate(archiveDates[archiveDates.length - 1]),
        },
        {
          latitude, longitude, api: 'forecast',
          startDate: toIsoDate(forecastDates[0]), endDate: toIsoDate(maxDate),
        },
      );
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
 * never supply it), and every other field is taken from the file whenever the file actually
 * carried it — including a genuine `0` (0°C, 0mm rain) — and from the API only when the file
 * did not. A field neither side has falls back to DEFAULT_DIARY_WEATHER.
 *
 * `fromFile` MUST be a `Partial<DiaryWeather>` built from the raw frontmatter (e.g.
 * `fmNumber(file, 'weather_min')`), not a `DiaryWeather` that has already been defaulted —
 * `DiaryWeather` itself cannot distinguish "the file said 0" from "the file said nothing",
 * so that distinction has to survive as `undefined` all the way to this function's input.
 * Where file and API disagree on a field the file DOES carry, the file stands; that
 * disagreement is a run-report concern, not something this function resolves.
 */
export function mergeWeather(fromFile: Partial<DiaryWeather>, fromApi: Partial<DiaryWeather>): DiaryWeather {
  return {
    code: fromApi.code ?? DEFAULT_DIARY_WEATHER.code,
    min: fromFile.min ?? fromApi.min ?? DEFAULT_DIARY_WEATHER.min,
    max: fromFile.max ?? fromApi.max ?? DEFAULT_DIARY_WEATHER.max,
    precip: fromFile.precip ?? fromApi.precip ?? DEFAULT_DIARY_WEATHER.precip,
    sunrise: fromFile.sunrise ?? fromApi.sunrise ?? DEFAULT_DIARY_WEATHER.sunrise,
    sunset: fromFile.sunset ?? fromApi.sunset ?? DEFAULT_DIARY_WEATHER.sunset,
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
