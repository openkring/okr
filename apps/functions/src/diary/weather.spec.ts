// apps/functions/src/diary/weather.spec.ts
import { describe, expect, it } from 'vitest';
import { chooseWeatherApi, mergeWeather, planWeatherRanges } from './weather';

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
    expect(mergeWeather({ min: 0, max: 0, precip: 0, sunrise: '', sunset: '' }, API).code).toBe(3);
  });

  it('keeps every value the file already had — the file is the historical record', () => {
    const file = { min: 1, max: 8, precip: 0, sunrise: '07:00', sunset: '17:00' };
    const merged = mergeWeather(file, API);
    expect(merged).toMatchObject({ code: 3, min: 1, max: 8, sunrise: '07:00', sunset: '17:00' });
  });

  it('leaves code at -1 when the api answered nothing — never guessed, never from the emoji', () => {
    expect(mergeWeather({}, {}).code).toBe(-1);
  });

  // A genuine 0 (0mm rain, 0°C) is a real measurement, not "absent" — the file's presence of a
  // key, not the value itself, is what decides. `fromFile` is a Partial<DiaryWeather> built from
  // the raw frontmatter (e.g. fmNumber), so "the key was there" and "the key held 0" both survive
  // as an own field, while "the key was missing" survives as `undefined`. These four would all
  // pass under naive `value !== 0` / `value || fallback` comparisons only by accident (or fail
  // outright) — they pin the actual contract.
  it('keeps a genuine zero precip from the file over a nonzero api value', () => {
    expect(mergeWeather({ precip: 0 }, { precip: 1.5 }).precip).toBe(0);
  });

  it('keeps a genuine zero min-temperature from the file over a nonzero api value', () => {
    expect(mergeWeather({ min: 0 }, { min: 2 }).min).toBe(0);
  });

  it('takes precip from the api when the file omits the key entirely', () => {
    expect(mergeWeather({}, { precip: 1.5 }).precip).toBe(1.5);
  });

  it('falls back to the model default when neither file nor api has the field', () => {
    expect(mergeWeather({}, {}).precip).toBe(0);
  });
});

describe('planWeatherRanges — Aggregate haben kein Wetter', () => {
  const staefa = { latitude: 47.24254, longitude: 8.72342 };

  it('ignoriert das genullte Datum eines Jahres-Aggregats', () => {
    const ranges = planWeatherRanges(
      [{ date: '19900000', ...staefa }, { date: '20200610', ...staefa }, { date: '20200612', ...staefa }],
      '20260901',
    );
    expect(ranges).toHaveLength(1);
    expect(ranges[0].startDate).toBe('2020-06-10');
    expect(ranges[0].endDate).toBe('2020-06-12');
  });

  it('ignoriert das genullte Datum eines Monats-Aggregats', () => {
    const ranges = planWeatherRanges([{ date: '20041000', ...staefa }, { date: '20041002', ...staefa }], '20260901');
    expect(ranges[0].startDate).toBe('2004-10-02');
  });

  it('weist auch einen unmöglichen Kalendertag ab', () => {
    // 31. Februar rollt in JS still auf den 3. Maerz weiter — genau das darf nicht passieren.
    const ranges = planWeatherRanges([{ date: '20040231', ...staefa }, { date: '20040301', ...staefa }], '20260901');
    expect(ranges[0].startDate).toBe('2004-03-01');
  });

  it('gibt gar keinen Bereich zurück, wenn nur Aggregate übrig bleiben', () => {
    expect(planWeatherRanges([{ date: '19900000', ...staefa }], '20260901')).toEqual([]);
  });
});

describe('chooseWeatherApi', () => {
  it('uses the live forecast host for the last seven days', () => {
    expect(chooseWeatherApi('20260903', '20260903')).toBe('current');
    expect(chooseWeatherApi('20260828', '20260903')).toBe('current');
  });
  it('uses the historical-forecast host inside the last year', () => {
    expect(chooseWeatherApi('20260801', '20260903')).toBe('forecast');
  });
  it('uses the archive host beyond a year', () => {
    expect(chooseWeatherApi('20240903', '20260903')).toBe('archive');
  });
});
