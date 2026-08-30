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

/**
 * A Date as a StoreDate (yyyyMMdd) in Europe/Zurich wall-clock time.
 *
 * The function runs in that zone, so the local getters are already correct — but going
 * through UTC here would shift the day boundary by an hour and silently mis-file the first
 * hour of every day.
 */
export function toStoreDate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export function toStoreDateTime(d: Date): string {
  return toStoreDate(d) +
    `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`;
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
 * Hours since a StoreDateTime, or Infinity when the stamp is missing or unparsable —
 * an unreadable stamp must mean "fetch now", never "skip forever".
 */
export function hoursSince(storeDateTime: string | undefined, now: Date): number {
  if (!storeDateTime || storeDateTime.length < 14) return Number.POSITIVE_INFINITY;
  const parsed = new Date(
    Number(storeDateTime.slice(0, 4)), Number(storeDateTime.slice(4, 6)) - 1, Number(storeDateTime.slice(6, 8)),
    Number(storeDateTime.slice(8, 10)), Number(storeDateTime.slice(10, 12)), Number(storeDateTime.slice(12, 14)));
  if (Number.isNaN(parsed.getTime())) return Number.POSITIVE_INFINITY;
  return (now.getTime() - parsed.getTime()) / 3_600_000;
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
