import { END_FUTURE_DATE_STR, MAX_YEAR, MIN_YEAR } from '@okr/shared-constants';
import { describe, expect, it } from 'vitest';
import {
    checkYearRange,
    classifyStoreDate,
    compareDate,
    convertDateFormat, copyDate,
    DateFormat,
    DatePart,
    extractFromDate,
    formatDateToken,
    getAge,
    getAgeFromBirthYear,
    getBirthYear,
    getStoreDateYear,
    getEndOfYear, getStartOfYear,
    getTodayStr,
    getYear,
    getYearDiff,
    isFutureDate,
    parseDate
} from './date.util';
describe('date.util', () => {

    // convertDateFormat
    it('convertDateFormat(20000915123015) -> Default = StoreDate', () => {
        const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime);
        expect(result).toEqual('20000915');
    });

    it('convertDateFormat(20000915123015 -> Date)', () => {
      const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.Date);
      expect(result).toEqual('Fri Sep 15 2000');
    });

    it('convertDateFormat(20000915123015 -> DateTime)', () => {
      const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.DateTime);
      expect(result).toEqual('Fri Sep 15 2000 12:30:15');
    });

    it('convertDateFormat(20000915123015 -> ViewDate)', () => {
      const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.ViewDate);
      expect(result).toEqual('15.09.2000');
    });

    it('convertDateFormat(20000915123015 -> ViewDateTime)', () => {
      const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.ViewDateTime);
      expect(result).toEqual('15.9.2000 12:30');
    });

    it('convertDateFormat(20000915123015 -> Year)', () => {
      const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.Year);
      expect(result).toEqual('2000');
    });

    it('convertDateFormat(20000915123015 -> StoreDate)', () => {
      const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.StoreDate);
      expect(result).toEqual('20000915');
    });
    it('convertDateFormat(20000915123015 -> StoreDateTime)', () => {
        const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.StoreDateTime);
        expect(result).toEqual('20000915123015');
    });

    it('convertDateFormat(20000915123015 -> IsoDate)', () => {
      const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.IsoDate);
      expect(result).toEqual('2000-09-15');
    });

    // regression: the 'T' in IsoDateTime must be escaped, otherwise date-fns treats it as the
    // milliseconds-timestamp token (format yields garbage, parse throws a RangeError).
    it('convertDateFormat(20000915123015 -> IsoDateTime)', () => {
      const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.IsoDateTime);
      expect(result).toEqual('2000-09-15T12:30:15');
    });

    it('convertDateFormat(IsoDateTime -> StoreDateTime) round-trips', () => {
      const result = convertDateFormat('2000-09-15T12:30:15', DateFormat.IsoDateTime, DateFormat.StoreDateTime);
      expect(result).toEqual('20000915123015');
    });

    it('convertDateFormat(20000915123015 -> Time)', () => {
      const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.Time);
      expect(result).toEqual('12:30');
    });

    it('convertDateFormat(20000915123015 -> DDMM)', () => {
      const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.DDMM);
      expect(result).toEqual('15.9');
    });

    it('convertDateFormat(20000915123015 -> SrvDate)', () => {
      const result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.SrvDate);
      expect(result).toEqual('15/9/00');
    });

    // TBD: convertDateFormatToString
    // TBD: parseDate
    // extractFromDate
    it('extractFromDate()', () => {
        const _date = parseDate('19991203091510', DateFormat.StoreDateTime);
        expect(extractFromDate(_date, DatePart.Year)).toEqual(1999);
        expect(extractFromDate(_date, DatePart.Month)).toEqual(11);
        expect(extractFromDate(_date, DatePart.Day)).toEqual(3);
        expect(extractFromDate(_date, DatePart.Hour)).toEqual(9);
        expect(extractFromDate(_date, DatePart.Minute)).toEqual(15);
        expect(extractFromDate(_date, DatePart.Second)).toEqual(10);
    });
    // TBD: checkDate
    // checkYearRange
    it('checkYearRange()', () => {
        expect(checkYearRange(new Date().getFullYear(), MIN_YEAR, MAX_YEAR)).toEqual(true);
        expect(checkYearRange(MIN_YEAR, MIN_YEAR, MAX_YEAR)).toEqual(true);
        expect(checkYearRange(MIN_YEAR - 1, MIN_YEAR, MAX_YEAR)).toEqual(false);
        expect(checkYearRange(MIN_YEAR + 1, MIN_YEAR, MAX_YEAR)).toEqual(true);
        expect(checkYearRange(MAX_YEAR, MIN_YEAR, MAX_YEAR)).toEqual(true);
        expect(checkYearRange(MAX_YEAR - 1, MIN_YEAR, MAX_YEAR)).toEqual(true);
        expect(checkYearRange(MAX_YEAR + 1, MIN_YEAR, MAX_YEAR)).toEqual(false);
    });
    // getYear
    it('getYear()', () => {
        expect(getYear()).toEqual(new Date().getFullYear());
    });
    it('getYear(2)', () => {
        expect(getYear(2)).toEqual(new Date().getFullYear() + 2);
    });
    it('getYear(-3)', () => {
        expect(getYear(-3)).toEqual(new Date().getFullYear() -3);
    });
    // getStartOfYear
    it('getStartOfYear()', () => {
        expect(getStartOfYear()).toEqual(new Date().getFullYear() * 10000 + 101);
    });
    it('getStartOfYear(1)', () => {
        const _currentYear = new Date().getFullYear();
        expect(getStartOfYear(1)).toEqual((_currentYear+1) * 10000 + 101);
    });
    // getEndOfYear
    it('getEndOfYear()', () => {
        expect(getEndOfYear()).toEqual(new Date().getFullYear() * 10000 + 1231);
    });
    it('getEndOfYear(1)', () => {
        const _currentYear = new Date().getFullYear();
        expect(getEndOfYear(1)).toEqual((_currentYear+1) * 10000 + 1231);
    });
    // tbd: getTodayStr
    // compareDate
    it('compareDate(getTodayStr(StoreDate), END_FUTURE_DATE_STR, DateFormat.StoreDate)', () => {
        const result = compareDate(getTodayStr(DateFormat.StoreDate), END_FUTURE_DATE_STR, DateFormat.StoreDate);
        expect(result).toEqual(-1);
    });
    it('compareDate(today, today, DateFormat.StoreDate)', () => {
        const _today = getTodayStr(DateFormat.StoreDate);
        const result = compareDate(_today, _today, DateFormat.StoreDate);
        expect(result).toEqual(0);
    });
    it('compareDate(END_FUTURE_DATE_STR, getTodayStr(StoreDate, -1), DateFormat.StoreDate)', () => {
        const result = compareDate(END_FUTURE_DATE_STR, getTodayStr(DateFormat.StoreDate), DateFormat.StoreDate);
        expect(result).toEqual(1);
    });
    // getYearDiff
    it('getYearDiff(getTodayStr(StoreDate, -1), DateFormat.StoreDate)', () => {
        const result = getYearDiff(getTodayStr(DateFormat.StoreDate, -1));
        expect(result).toEqual(1);
    });
    it('getYearDiff(getTodayStr(), DateFormat.StoreDate)', () => {
        const result = getYearDiff(getTodayStr(), DateFormat.StoreDate);
        expect(result).toEqual(0);
    });
    it('getYearDiff(getTodayStr(StoreDate, +5), DateFormat.StoreDate)', () => {
        const result = getYearDiff(getTodayStr(DateFormat.StoreDate, 5), DateFormat.StoreDate);
        expect(result).toEqual(-5);
    });
    // isFutureDate
    it('isFutureDate(new Date(END_FUTURE_DATE_STR)', () => {
        const result = isFutureDate(END_FUTURE_DATE_STR);
        expect(result).toEqual(true);
    });
    it('isFutureDate(19901014)', () => {
        const result = isFutureDate('19901014');
        expect(result).toEqual(false);
    });

    // copyDate
    it('copyDate(new Date(1995-12-17T03:24:00))', () => {
        const result = copyDate(new Date('1995-12-17T03:24:00'));
        expect(result.getFullYear()).toEqual(1995);
        expect(result.getMonth()).toEqual(11);
        expect(result.getDate()).toEqual(17);
        expect(result.getHours()).toEqual(3);
        expect(result.getMinutes()).toEqual(24);
    });

    describe('formatDateToken', () => {
        it('should return the view date only, when the time is midnight', () => {
            expect(formatDateToken('2026-07-19T00:00')).toEqual('19.07.2026');
        });

        it('should append the time, when it is not midnight', () => {
            expect(formatDateToken('2026-07-19T14:30')).toEqual('19.07.2026 14:30');
        });

        it('should return the view date only, when no time part is given', () => {
            expect(formatDateToken('2026-07-19')).toEqual('19.07.2026');
        });

        it('should ignore the seconds of a full iso date time', () => {
            expect(formatDateToken('2026-07-19T14:30:45')).toEqual('19.07.2026 14:30');
        });
    });

    // getStoreDateYear (privacy 1.19: the degraded-precision replica of any vault date)
    describe('getStoreDateYear', () => {
        it('extracts YYYY from a StoreDate', () => {
            expect(getStoreDateYear('20240115')).toBe('2024');
        });
        it('returns empty for missing/invalid input', () => {
            expect(getStoreDateYear('')).toBe('');
            expect(getStoreDateYear(undefined)).toBe('');
            expect(getStoreDateYear('2024')).toBe('');
            expect(getStoreDateYear('202401151')).toBe('');
        });
    });

    // getBirthYear (privacy 1.19: degraded-precision replica)
    describe('getBirthYear', () => {
        it('extracts YYYY from a StoreDate', () => {
            expect(getBirthYear('19851231')).toBe('1985');
        });
        it('returns empty for missing/invalid input', () => {
            expect(getBirthYear('')).toBe('');
            expect(getBirthYear(undefined)).toBe('');
            expect(getBirthYear('1985')).toBe('');
        });
    });

    // getAgeFromBirthYear (privacy 1.19: readers use the memberBirthYear replica)
    describe('getAgeFromBirthYear', () => {
        it('computes the age in years against a reference year', () => {
            expect(getAgeFromBirthYear('1985', 2026)).toBe(41);
        });
        it('returns -1 for missing/invalid input', () => {
            expect(getAgeFromBirthYear('', 2026)).toBe(-1);
            expect(getAgeFromBirthYear(undefined, 2026)).toBe(-1);
            expect(getAgeFromBirthYear('19851231', 2026)).toBe(-1);
        });
    });

    describe('classifyStoreDate', () => {
        it('classifies a complete date as full', () => {
            expect(classifyStoreDate('19850415')).toBe('full');
        });

        it('classifies the year-only sentinel', () => {
            expect(classifyStoreDate('19850000')).toBe('yearOnly');
        });

        it('classifies the day-month-only sentinel', () => {
            expect(classifyStoreDate('00000415')).toBe('dayMonthOnly');
        });

        it('treats an empty or missing value as none', () => {
            expect(classifyStoreDate('')).toBe('none');
            expect(classifyStoreDate(undefined)).toBe('none');
        });

        it('rejects an all-filler value, which claims nothing', () => {
            expect(classifyStoreDate('00000000')).toBe('none');
        });

        it('rejects a wrong length', () => {
            expect(classifyStoreDate('1985041')).toBe('none');
            expect(classifyStoreDate('198504150')).toBe('none');
        });

        it('rejects non-digits', () => {
            expect(classifyStoreDate('1985xxxx')).toBe('none');
            expect(classifyStoreDate('abcdefgh')).toBe('none');
        });

        it('rejects a year outside 1850-2100', () => {
            expect(classifyStoreDate('18490415')).toBe('none');
            expect(classifyStoreDate('21010415')).toBe('none');
        });

        it('accepts the range boundaries', () => {
            expect(classifyStoreDate('18500415')).toBe('full');
            expect(classifyStoreDate('21000415')).toBe('full');
        });

        it('rejects an impossible month or day', () => {
            expect(classifyStoreDate('19851315')).toBe('none');  // month 13
            expect(classifyStoreDate('19850400')).toBe('none');  // day 0
            expect(classifyStoreDate('19850431')).toBe('none');  // 31 April
            expect(classifyStoreDate('00000230')).toBe('none');  // 30 February
        });

        it('accepts 29 February without a year, since the leap question is unanswerable', () => {
            expect(classifyStoreDate('00000229')).toBe('dayMonthOnly');
        });

        it('leaves full calendar validity to checkDate', () => {
            // 1985 was not a leap year; classify is structural, isValidPartialStoreDate rejects it.
            expect(classifyStoreDate('19850229')).toBe('full');
        });
    });

    describe('getStoreDateYear with partial dates', () => {
        it('returns the year of a full date', () => {
            expect(getStoreDateYear('19850415')).toBe('1985');
        });

        it('returns the year of a year-only date', () => {
            expect(getStoreDateYear('19850000')).toBe('1985');
        });

        it('never returns the filler as a year', () => {
            // a '0000' birth year would put these people into a bogus year-0 cohort
            // in the memberBirthYear replica (spec 1.19)
            expect(getStoreDateYear('00000415')).toBe('');
        });

        it('returns an empty year for a malformed value', () => {
            expect(getStoreDateYear('abcdefgh')).toBe('');
            expect(getStoreDateYear('')).toBe('');
            expect(getStoreDateYear(undefined)).toBe('');
        });
    });

    describe('getAge with partial dates', () => {
        it('computes the same age from a year-only date as from a full one', () => {
            expect(getAge('19850415', false, 2026)).toBe(41);
            expect(getAge('19850000', false, 2026)).toBe(41);
        });

        it('has no age for a date whose year is unknown', () => {
            expect(getAge('00000415', false, 2026)).toBe(-1);
        });

        it('still buckets a year-only date by decade', () => {
            expect(getAge('19850000', true, 2026)).toBe(4);
        });

        it('has no age for a malformed value', () => {
            expect(getAge('19850000000', false, 2026)).toBe(-1);
            expect(getAge('', false, 2026)).toBe(-1);
        });
    });
});
