import { describe, expect, it } from 'vitest';
import {
  composeDiaryDate, diaryDateMatchesScope, diaryHeadlineSortKey, diaryYearBounds, diaryYearList, diaryYearOf,
  isDiaryCalendarDay, splitDiaryDate, DIARY_FIRST_YEAR,
} from './diary-date.util';

describe('splitDiaryDate', () => {
  it('splits a day', () => expect(splitDiaryDate('20220306')).toEqual({ year: 2022, month: 3, day: 6 }));
  it('keeps zeroed components', () => expect(splitDiaryDate('20041000')).toEqual({ year: 2004, month: 10, day: 0 }));
  it('rejects anything but 8 digits', () => {
    expect(splitDiaryDate('')).toBeUndefined();
    expect(splitDiaryDate('2022-03-06')).toBeUndefined();
  });
});

describe('composeDiaryDate', () => {
  it('pads a day', () => expect(composeDiaryDate('day', 2022, 3, 6)).toBe('20220306'));
  it('zeroes the day for a month', () => expect(composeDiaryDate('month', 2004, 10, 17)).toBe('20041000'));
  it('zeroes month and day for a year', () => expect(composeDiaryDate('year', 1990, 5, 5)).toBe('19900000'));
  it('returns empty for a year outside 1000..9999', () => expect(composeDiaryDate('year', 0)).toBe(''));
});

describe('isDiaryCalendarDay', () => {
  it('accepts a real day', () => expect(isDiaryCalendarDay('20240229')).toBe(true));
  it('rejects zeroed and impossible days', () => {
    expect(isDiaryCalendarDay('20041000')).toBe(false);
    expect(isDiaryCalendarDay('20230229')).toBe(false);
    expect(isDiaryCalendarDay('20221301')).toBe(false);
  });
});

describe('diaryDateMatchesScope', () => {
  it('day needs a calendar day', () => {
    expect(diaryDateMatchesScope('20220306', 'day')).toBe(true);
    expect(diaryDateMatchesScope('20220300', 'day')).toBe(false);
  });
  it('month needs a month and a zero day', () => {
    expect(diaryDateMatchesScope('20041000', 'month')).toBe(true);
    expect(diaryDateMatchesScope('20041001', 'month')).toBe(false);
    expect(diaryDateMatchesScope('20040000', 'month')).toBe(false);
    expect(diaryDateMatchesScope('20041300', 'month')).toBe(false);
  });
  it('year needs zero month and day', () => {
    expect(diaryDateMatchesScope('19900000', 'year')).toBe(true);
    expect(diaryDateMatchesScope('19900100', 'year')).toBe(false);
  });
});

describe('diaryYearOf / diaryYearBounds / diaryYearList', () => {
  it('reads the year of any scope', () => {
    expect(diaryYearOf('19900000')).toBe(1990);
    expect(diaryYearOf('')).toBeUndefined();
  });
  it('bounds cover the aggregates of the year', () => {
    expect(diaryYearBounds(1990)).toEqual({ from: '19900000', to: '19901231' });
  });
  it('lists from the first archive year to today, newest first', () => {
    const years = diaryYearList();
    expect(years[years.length - 1]).toBe(DIARY_FIRST_YEAR);
    expect(years[0]).toBe(new Date().getFullYear());
  });
  it('raises an aggregate above the period it summarises', () => {
    expect(diaryHeadlineSortKey('19900000')).toBe('19909999');
    expect(diaryHeadlineSortKey('20041000')).toBe('20041099');
    expect(diaryHeadlineSortKey('20041031')).toBe('20041031');
    expect(diaryHeadlineSortKey('')).toBe('');
  });
  it('sorts a year over its months and a month over its days, newest first', () => {
    const dates = ['19900101', '19900000', '19901000', '19901031'];
    const sorted = [...dates].sort((a, b) => diaryHeadlineSortKey(b).localeCompare(diaryHeadlineSortKey(a)));
    expect(sorted).toEqual(['19900000', '19901000', '19901031', '19900101']);
  });
});
