// `onSchedule({ timeZone })` only controls WHEN the job fires — the container itself runs in
// UTC, so `toStoreDate`/`toStoreDateTime` (srv/zurich-time.ts) pin the formatting to
// Europe/Zurich explicitly rather than inherit it from the host. Without that, `fetchedAt`
// would mis-stamp (the widgets show "last updated" two hours out) and the interval gate would
// read yesterday's document between 22:00 and midnight UTC.
import { toStoreDate, toStoreDateTime } from '../srv/zurich-time';

/**
 * The tag that marks a location as a weather location.
 *
 * Tag VALUES are stored as i18n keys in this repo, not as plain words — the `tags` definition
 * for `location` reads `@tag.important, @tag.review, @tag.selectable, @tag.test, @tag.weather`,
 * and a record carries that key verbatim. Matching on the bare word `weather` finds nothing and
 * fails the way this kind of mistake always does: the run succeeds and logs "no locations".
 */
export const WEATHER_TAG = '@tag.weather';

/** True when a record's comma-separated `tags` field carries the weather tag. */
export function hasWeatherTag(tags: string | undefined): boolean {
  return (tags ?? '').split(',').map((t) => t.trim()).includes(WEATHER_TAG);
}

/** Identifies which service produced a document — stored so a provider swap stays traceable. */
export const PROVIDER = 'open-meteo';

/**
 * Pure transformation of a provider response into `weather` documents.
 *
 * Kept apart from `fetch-weather.ts` so it can be tested without importing the scheduler
 * trigger: the field names below are guesses about someone else's API until something
 * actually runs them against a real payload.
 */
export interface LocationDoc {
  okey: string;
  name: string;
  latitude: number;
  longitude: number;
  tags?: string;
  tenants?: string[];
}

export interface OpenMeteoResponse {
  daily: Record<string, (number | string)[]>;
  hourly: Record<string, (number | string)[]>;
}

/** `'2026-08-29T16:00'` (Open-Meteo's local ISO) → `{ date: '20260829', time: '16:00' }`. */
export function splitIsoLocal(iso: string): { date: string; time: string } {
  const [datePart, timePart = '00:00'] = iso.split('T');
  return { date: datePart.replace(/-/g, ''), time: timePart.slice(0, 5) };
}

export function num(value: number | string | undefined): number {
  const n = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(n) ? (n as number) : 0;
}

/**
 * Hours since a StoreDateTime, or Infinity when the stamp is missing or unparsable — an
 * unreadable stamp must mean "fetch now", never "skip forever" (a NaN comparison would be
 * false against any interval and skip the location on every run, forever).
 *
 * Both sides are read as Europe/Zurich wall clock, so the difference is real elapsed time —
 * except across a DST switch, where it is off by an hour once a year. With a 4-hour interval
 * that is not worth a date library.
 */
export function hoursSince(storeDateTime: string | undefined, now: Date): number {
  if (!storeDateTime || storeDateTime.length < 14) return Number.POSITIVE_INFINITY;
  const asEpoch = (stamp: string): number => Date.UTC(
    Number(stamp.slice(0, 4)), Number(stamp.slice(4, 6)) - 1, Number(stamp.slice(6, 8)),
    Number(stamp.slice(8, 10)), Number(stamp.slice(10, 12)), Number(stamp.slice(12, 14)));
  const then = asEpoch(storeDateTime);
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return (asEpoch(toStoreDateTime(now)) - then) / 3_600_000;
}

/** Builds the per-day documents for one location out of a single provider response. */
export function buildWeatherDocs(
  location: LocationDoc, data: OpenMeteoResponse, now: Date
): Record<string, unknown>[] {
  const today = toStoreDate(now);
  const fetchedAt = toStoreDateTime(now);

  // Group the hourly series by day first, so each document carries only its own hours.
  const hoursByDate = new Map<string, Record<string, unknown>[]>();
  const times = (data.hourly?.['time'] ?? []) as string[];
  times.forEach((iso, i) => {
    const { date, time } = splitIsoLocal(iso);
    const precipitation = num(data.hourly['precipitation']?.[i]);
    const wind = num(data.hourly['wind_speed_10m']?.[i]);
    const temp = num(data.hourly['temperature_2m']?.[i]);
    const hour = {
      time,
      code: num(data.hourly['weather_code']?.[i]),
      isDay: num(data.hourly['is_day']?.[i]) === 1,
      temp,
      // Open-Meteo's standard forecast has no ensemble spread; the widgets hide a range
      // that equals its value, so writing the value twice degrades gracefully to "no range"
      // rather than to a fake one.
      tempMin: temp, tempMax: temp,
      precipitation,
      precipitationMin: precipitation, precipitationMax: precipitation,
      precipitationProbability: num(data.hourly['precipitation_probability']?.[i]),
      wind, windMin: wind, windMax: wind,
      windDirection: num(data.hourly['wind_direction_10m']?.[i]),
      gusts: num(data.hourly['wind_gusts_10m']?.[i]),
      sunshineMinutes: Math.round(num(data.hourly['sunshine_duration']?.[i]) / 60),
    };
    hoursByDate.set(date, [...(hoursByDate.get(date) ?? []), hour]);
  });

  const dates = (data.daily?.['time'] ?? []) as string[];
  return dates.map((iso, i) => {
    const date = iso.replace(/-/g, '');
    const precipitation = num(data.daily['precipitation_sum']?.[i]);
    return {
      okey: `${location.okey}-${date}`,
      tenants: location.tenants ?? [],
      isArchived: false,
      index: `${location.name} ${date}`.toLowerCase(),
      locationKey: location.okey,
      date,
      fetchedAt,
      provider: PROVIDER,
      // A day still in the future (or today) is a forecast; anything earlier has happened and
      // freezes on the next run. This is the whole archiving mechanism.
      isForecast: date >= today,
      daily: {
        code: num(data.daily['weather_code']?.[i]),
        tempMin: num(data.daily['temperature_2m_min']?.[i]),
        tempMax: num(data.daily['temperature_2m_max']?.[i]),
        precipitation,
        precipitationMin: precipitation, precipitationMax: precipitation,
        precipitationProbability: num(data.daily['precipitation_probability_max']?.[i]),
        windMax: num(data.daily['wind_speed_10m_max']?.[i]),
        gustsMax: num(data.daily['wind_gusts_10m_max']?.[i]),
        sunshineMinutes: Math.round(num(data.daily['sunshine_duration']?.[i]) / 60),
        sunrise: splitIsoLocal(String(data.daily['sunrise']?.[i] ?? '')).time,
        sunset: splitIsoLocal(String(data.daily['sunset']?.[i] ?? '')).time,
      },
      hourly: hoursByDate.get(date) ?? [],
      notes: '',
    };
  });
}
