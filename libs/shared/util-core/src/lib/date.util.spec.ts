import { END_FUTURE_DATE_STR, MAX_YEAR, MIN_YEAR } from '@bk2/shared-constants';
import { describe, expect, it } from 'vitest';
import {
    checkYearRange,
    compareDate,
    convertDateFormat, copyDate,
    DateFormat,
    DatePart,
    extractFromDate,
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
        const _result = convertDateFormat('20000915123015', DateFormat.StoreDateTime);
        expect(_result).toEqual('20000915');
    });

    it('convertDateFormat(20000915123015 -> Date)', () => {
      const _result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.Date);
      expect(_result).toEqual('Fri Sep 15 2000');
    });

    it('convertDateFormat(20000915123015 -> DateTime)', () => {
      const _result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.DateTime);
      expect(_result).toEqual('Fri Sep 15 2000 12:30:15');
    });

    it('convertDateFormat(20000915123015 -> ViewDate)', () => {
      const _result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.ViewDate);
      expect(_result).toEqual('15.09.2000');
    });

    it('convertDateFormat(20000915123015 -> ViewDateTime)', () => {
      const _result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.ViewDateTime);
      expect(_result).toEqual('15.9.2000 12:30');
    });

    it('convertDateFormat(20000915123015 -> Year)', () => {
      const _result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.Year);
      expect(_result).toEqual('2000');
    });

    it('convertDateFormat(20000915123015 -> StoreDate)', () => {
      const _result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.StoreDate);
      expect(_result).toEqual('20000915');
    });
    it('convertDateFormat(20000915123015 -> StoreDateTime)', () => {
        const _result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.StoreDateTime);
        expect(_result).toEqual('20000915123015');
    });

    it('convertDateFormat(20000915123015 -> IsoDate)', () => {
      const _result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.IsoDate);
      expect(_result).toEqual('2000-09-15');
    });

    it('convertDateFormat(20000915123015 -> Time)', () => {
      const _result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.Time);
      expect(_result).toEqual('12:30');
    });

    it('convertDateFormat(20000915123015 -> DDMM)', () => {
      const _result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.DDMM);
      expect(_result).toEqual('15.9');
    });

    it('convertDateFormat(20000915123015 -> SrvDate)', () => {
      const _result = convertDateFormat('20000915123015', DateFormat.StoreDateTime, DateFormat.SrvDate);
      expect(_result).toEqual('15/9/00');
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
        const _result = compareDate(getTodayStr(DateFormat.StoreDate), END_FUTURE_DATE_STR, DateFormat.StoreDate);
        expect(_result).toEqual(-1);
    });
    it('compareDate(today, today, DateFormat.StoreDate)', () => {
        const _today = getTodayStr(DateFormat.StoreDate);
        const _result = compareDate(_today, _today, DateFormat.StoreDate);
        expect(_result).toEqual(0);
    });
    it('compareDate(END_FUTURE_DATE_STR, getTodayStr(StoreDate, -1), DateFormat.StoreDate)', () => {
        const _result = compareDate(END_FUTURE_DATE_STR, getTodayStr(DateFormat.StoreDate), DateFormat.StoreDate);
        expect(_result).toEqual(1);
    });
    // getYearDiff
    it('getYearDiff(getTodayStr(StoreDate, -1), DateFormat.StoreDate)', () => {
        const _result = getYearDiff(getTodayStr(DateFormat.StoreDate, -1));
        expect(_result).toEqual(1);
    });
    it('getYearDiff(getTodayStr(), DateFormat.StoreDate)', () => {
        const _result = getYearDiff(getTodayStr(), DateFormat.StoreDate);
        expect(_result).toEqual(0);
    });
    it('getYearDiff(getTodayStr(StoreDate, +5), DateFormat.StoreDate)', () => {
        const _result = getYearDiff(getTodayStr(DateFormat.StoreDate, 5), DateFormat.StoreDate);
        expect(_result).toEqual(-5);
    });
    // isFutureDate
    it('isFutureDate(new Date(END_FUTURE_DATE_STR)', () => {
        const _result = isFutureDate(END_FUTURE_DATE_STR);
        expect(_result).toEqual(true);
    });
    it('isFutureDate(19901014)', () => {
        const _result = isFutureDate('19901014');
        expect(_result).toEqual(false);
    });

    // copyDate
    it('copyDate(new Date(1995-12-17T03:24:00))', () => {
        const _result = copyDate(new Date('1995-12-17T03:24:00'));
        expect(_result.getFullYear()).toEqual(1995);
        expect(_result.getMonth()).toEqual(11);
        expect(_result.getDate()).toEqual(17);
        expect(_result.getHours()).toEqual(3);
        expect(_result.getMinutes()).toEqual(24);
    });
});