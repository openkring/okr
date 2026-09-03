import { describe, expect, it, vi } from 'vitest';

vi.mock('./weather', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./weather')>()),
  fetchWeatherRange: vi.fn(async () => new Map([['20260903', { code: 3, min: 12.1, max: 21.4, precip: 0, sunrise: '06:50', sunset: '20:05' }]])),
}));

import { weatherForDay } from './fetch-diary-weather';

describe('weatherForDay', () => {
  it('returns the merged day', async () => {
    const w = await weatherForDay({ date: '20260903', latitude: 47.24, longitude: 8.72 }, '20260903');
    expect(w).toEqual({ code: 3, min: 12.1, max: 21.4, precip: 0, sunrise: '06:50', sunset: '20:05' });
  });
  it('rejects an aggregate date', async () => {
    await expect(weatherForDay({ date: '20260900', latitude: 1, longitude: 1 }, '20260903')).rejects.toThrow();
  });
  it('returns null when the API has no row for the day', async () => {
    const w = await weatherForDay({ date: '20260902', latitude: 47.24, longitude: 8.72 }, '20260903');
    expect(w).toBeNull();
  });
});
