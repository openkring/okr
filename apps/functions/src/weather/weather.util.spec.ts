import { describe, expect, it } from 'vitest';

import { buildWeatherDocs, hoursSince, toStoreDate } from './weather.util';
import fixture from './open-meteo.fixture.json';

/**
 * The fixture is a real Open-Meteo response for Stäfa (47.2410, 8.7210), captured
 * 2026-08-30 and trimmed to 3 days / 72 hours. It exists because every field name in
 * `weather.util.ts` is an assumption about someone else's API — and a wrong name there
 * yields a silent zero, not an error.
 */
const location = {
  okey: 'loc1', name: 'Stäfa', latitude: 47.241, longitude: 8.721,
  tags: 'weather', tenants: ['scs'],
};

// 2026-08-30 14:30 local — the fixture's first day
const now = new Date(2026, 7, 30, 14, 30, 0);

describe('buildWeatherDocs — against a real provider response', () => {
  const docs = buildWeatherDocs(location, fixture as never, now);

  it('produces one document per day', () => {
    expect(docs).toHaveLength(3);
    expect(docs.map((d) => d['date'])).toEqual(['20260830', '20260831', '20260901']);
  });

  it('keys each document by location and StoreDate', () => {
    expect(docs[0]['okey']).toBe('loc1-20260830');
  });

  it('carries the location tenants so the tenant query can find it', () => {
    expect(docs[0]['tenants']).toEqual(['scs']);
  });

  it('reads the daily values rather than defaulting them to zero', () => {
    // The whole point of the fixture: a renamed provider field would zero these silently.
    const daily = docs[0]['daily'] as Record<string, number>;
    expect(daily['tempMin']).toBeGreaterThan(-50);
    expect(daily['tempMax']).toBeGreaterThan(daily['tempMin']);
    expect(daily['tempMax']).toBeLessThan(50);
    expect(daily['gustsMax']).toBeGreaterThan(0);
    expect(daily['sunshineMinutes']).toBeGreaterThan(0);
    // sunshine arrives in SECONDS per day; 46800 s must become 780 min, not 46800
    expect(daily['sunshineMinutes']).toBeLessThanOrEqual(24 * 60);
  });

  it('extracts sunrise and sunset as a plain time, not an ISO stamp', () => {
    const daily = docs[0]['daily'] as Record<string, string>;
    expect(daily['sunrise']).toMatch(/^\d{2}:\d{2}$/);
    expect(daily['sunset']).toMatch(/^\d{2}:\d{2}$/);
  });

  it('buckets each hour into its own day, 24 per day', () => {
    docs.forEach((doc) => {
      expect((doc['hourly'] as unknown[]).length).toBe(24);
    });
  });

  it('keeps the hours in order and starts each day at midnight', () => {
    const hours = docs[0]['hourly'] as { time: string }[];
    expect(hours[0].time).toBe('00:00');
    expect(hours[23].time).toBe('23:00');
  });

  it('converts hourly sunshine seconds to minutes within the hour', () => {
    const hours = docs[0]['hourly'] as { sunshineMinutes: number }[];
    hours.forEach((h) => expect(h.sunshineMinutes).toBeLessThanOrEqual(60));
    expect(hours.some((h) => h.sunshineMinutes > 0)).toBe(true);
  });

  it('marks day and night from is_day rather than guessing from the clock', () => {
    const hours = docs[0]['hourly'] as { time: string; isDay: boolean }[];
    expect(hours.find((h) => h.time === '03:00')?.isDay).toBe(false);
    expect(hours.find((h) => h.time === '12:00')?.isDay).toBe(true);
  });

  it('flags today and the future as forecast', () => {
    expect(docs.map((d) => d['isForecast'])).toEqual([true, true, true]);
  });

  it('freezes a day that has passed — this IS the archiving mechanism', () => {
    // Same payload, read a week later: every day is now history.
    const later = buildWeatherDocs(location, fixture as never, new Date(2026, 8, 8));
    expect(later.map((d) => d['isForecast'])).toEqual([false, false, false]);
  });

  it('treats today as forecast right up to midnight, not from noon', () => {
    const lateToday = buildWeatherDocs(location, fixture as never, new Date(2026, 7, 30, 23, 59));
    expect(lateToday[0]['isForecast']).toBe(true);
  });
});

describe('toStoreDate', () => {
  it('zero-pads month and day', () => {
    expect(toStoreDate(new Date(2026, 0, 5))).toBe('20260105');
  });

  it('uses local wall clock, so an evening date does not roll into the next UTC day', () => {
    expect(toStoreDate(new Date(2026, 7, 30, 23, 30))).toBe('20260830');
  });
});

describe('hoursSince', () => {
  const now = new Date(2026, 7, 30, 12, 0, 0);

  it('measures the gap to a StoreDateTime', () => {
    expect(hoursSince('20260830080000', now)).toBeCloseTo(4, 5);
  });

  it('returns Infinity for a missing or truncated stamp — "fetch now", never "skip forever"', () => {
    expect(hoursSince(undefined, now)).toBe(Number.POSITIVE_INFINITY);
    expect(hoursSince('', now)).toBe(Number.POSITIVE_INFINITY);
    expect(hoursSince('2026', now)).toBe(Number.POSITIVE_INFINITY);
  });

  it('returns Infinity for an unparsable stamp rather than a NaN that compares false', () => {
    // NaN < interval is false, which would silently skip the location on every run.
    expect(hoursSince('xxxxxxxxxxxxxx', now)).toBe(Number.POSITIVE_INFINITY);
  });
});
