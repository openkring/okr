// apps/functions/src/diary/weather.spec.ts
import { describe, expect, it } from 'vitest';
import { mergeWeather, planWeatherRanges } from './weather';

const AT = (date: string, latitude: number, longitude: number) => ({ date, latitude, longitude });

describe('planWeatherRanges', () => {
  it('makes one range per place, spanning its first to its last date', () => {
    const ranges = planWeatherRanges([
      AT('20200103', 47.24, 8.72), AT('20220615', 47.24, 8.72), AT('20210101', 46.5, 9.5),
    ], '20260823');
    expect(ranges).toHaveLength(2);
    const staefa = ranges.find((r) => r.latitude === 47.24);
    expect(staefa).toMatchObject({ startDate: '2020-01-03', endDate: '2022-06-15', api: 'archive' });
  });

  it('splits a place that straddles the archive/forecast boundary into two ranges', () => {
    // The boundary is ~1 year before today, so it MOVES. It must never be hardcoded.
    const ranges = planWeatherRanges([AT('20240101', 47.24, 8.72), AT('20260801', 47.24, 8.72)], '20260823');
    expect(ranges.map((r) => r.api).sort()).toEqual(['archive', 'forecast']);
  });

  it('puts a recent-only place entirely on the forecast api', () => {
    expect(planWeatherRanges([AT('20260801', 47.24, 8.72)], '20260823')[0].api).toBe('forecast');
  });

  it('ignores entries with no coordinates, so an unresolved place costs no call', () => {
    expect(planWeatherRanges([], '20260823')).toEqual([]);
  });
});

describe('mergeWeather', () => {
  const API = { code: 3, min: 2, max: 9, precip: 1.5, sunrise: '07:40', sunset: '17:12' };

  it('takes code from the api — the file never has it', () => {
    expect(mergeWeather({ code: -1, min: 0, max: 0, precip: 0, sunrise: '', sunset: '' }, API).code).toBe(3);
  });

  it('keeps every value the file already had — the file is the historical record', () => {
    const file = { code: -1, min: 1, max: 8, precip: 0, sunrise: '07:00', sunset: '17:00' };
    const merged = mergeWeather(file, API);
    expect(merged).toMatchObject({ code: 3, min: 1, max: 8, sunrise: '07:00', sunset: '17:00' });
  });

  it('leaves code at -1 when the api answered nothing — never guessed, never from the emoji', () => {
    const file = { code: -1, min: 0, max: 0, precip: 0, sunrise: '', sunset: '' };
    expect(mergeWeather(file, {}).code).toBe(-1);
  });
});
