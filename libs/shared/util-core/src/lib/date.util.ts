import { format, isValid, isAfter, isFuture, differenceInCalendarDays, differenceInHours, getISODay, parse, compareAsc, add, Duration } from 'date-fns';
import { die, warn } from './log.util';
import { END_FUTURE_DATE_STR } from '@bk2/shared/constants';

export enum DateFormat {
    Date = 'EEE MMM dd yyyy',
    DateTime = 'EEE MMM dd yyyy HH:mm:ss',
    ViewDate = 'dd.MM.yyyy',
    ViewDateTime = 'd.M.yyyy HH:mm',
    Year = 'yyyy',
    StoreDate = 'yyyyMMdd',
    StoreDateTime = 'yyyyMMddHHmmss',
    IsoDate = 'yyyy-MM-dd',
    IsoDateTime = 'yyyy-MM-ddTHH:mm:ss',
    Time = 'HH:mm',
    DDMM = 'd.M',
    SrvDate = 'd/M/yy',
}

export const STORE_DATE_FILLER = '0000';

export enum DatePlaceholders {
    Date = 'dd.mm.yyyy',
    DateTime = 'dd.mm.yyyy hh:mm'
}

export enum DatePart {
    Year = 'yyyy',
    Month = 'MM',
    Day = 'dd',
    Hour = 'HH',
    Minute = 'mm',
    Second = 'ss'
}

/* ------------------- date format conversions ----------------------- */
/**
 * Convert a date from one format to another.
 * @param value the date to convert. It must be of type Date or in a stringified format
 * @param fromFormat the date format that the date value should have
 * @param toFormat the date format for the result
 * @param isStrict the date needs to be a valid format; otherwise, '' is a valid format, too (e.g. for optional date fields)
 */
export function convertDateFormat(value: string, fromFormat: DateFormat, toFormat = DateFormat.StoreDate, isStrict=true): string|Date
{
    const _date = parseDate(value, fromFormat, isStrict);
    if (!_date) {
        if (isStrict === true) die('date.util/convertDateFormat: invalid date');
        else return '';
    }
    return format(_date, toFormat);
}

export function convertDateFormatToString(value: string | undefined, fromFormat: DateFormat, toFormat = DateFormat.StoreDate, isStrict=true): string {
  if (value === undefined || value.length === 0) {
    if (isStrict === true) {
      die('date.util.convertDateFormatToString: invalid date');
    } else {
      return '';
    }
  }
  const _result = convertDateFormat(value, fromFormat, toFormat, isStrict);
  if (typeof _result !== 'string') die('date.util.convertDateFormatToString: ERROR not a string');
  return _result;
}

export function convertStoreDateToIsoWithDefaultToday(storeDate: string | undefined): string {
    if (!storeDate || storeDate.length !== 8 || storeDate.startsWith('9999')) return getTodayStr(DateFormat.IsoDate);
    return convertDateFormatToString(storeDate, DateFormat.StoreDate, DateFormat.IsoDate);
}

export function convertIsoDateWithDefaultToday(isoDate: string | undefined): string {
    return (!isoDate || isoDate.length !== 10 || isoDate.startsWith('9999')) ? getTodayStr(DateFormat.IsoDate) : isoDate;
}

/**
 * Accepts a date in any stringified format (YEAR, STOREDATE, STOREDATETIME) and converts it into a stringified date in the given format.
 * Invalid dates and END_FUTURE_DATE are returned as undefined.
 * @param value 
 * @param toFormat 
 * @returns 
 */
export function convertDateFromAnyFormatToString(value: string, toFormat = DateFormat.StoreDate): string | undefined {
  const _format = getFormatFromDateLength(value);
  if (!_format || value.startsWith('9999')) return undefined;
  const _date = parseDate(value, _format, false);
  return !_date ? undefined : format(_date, toFormat);
}

/**
 * 
 * @param storeDate 
 * @param showYear if true, the year is shown, otherwise not
 * @returns 
 */
export function prettyFormatDate(storeDate: string | undefined, showYear = true): string {
    if (!storeDate || storeDate.length < 8) return '';
    if (storeDate.substring(0, 8).endsWith('0000')) {
      return showYear ? storeDate.substring(0, 4) : '';
    }
    return convertDateFormatToString(storeDate.substring(0, 8), DateFormat.StoreDate, showYear ? DateFormat.ViewDate : DateFormat.DDMM, false);
  }

/**
 * Parses either a Date or a stringified date in a given DateFormat and returns.
 * END_FUTURE_DATE is returned as null.
 * - the Date representation
 * - null for optional date values
 * @param value the value to parse into a date
 * @param fromFormat the format of the stringified date input
 * @param isStrict whether the conversion must be strict
 * @returns either the parsed Date or null if the given value is not correct
 */
export function parseDate(value: string, fromFormat: DateFormat, isStrict=true): Date|null {
    if (!value || value.length === 0) {
        if (isStrict === true) {
            die('date.util/parseDate: invalid value');
        } else {
            return null;
        }
    }
    const _date =  parse(value, fromFormat, new Date());
    return (!_date || isEndFutureDate(_date)) ? null : _date;
}

export function isEndFutureDate(date: Date): boolean {
    return date.getFullYear() === 9999;
}


/**
 * Extracts a part of a date (year, month, day, hour, minute, second).
 * @param value the date; must be of type Date
 * @param part the part to extract as a number
 */
export function extractFromDate(value: unknown, part: DatePart): number {
    if (!value) die('date.util/extractFromDate: invalid date value');
    if (!(value instanceof Date)) die('date.util/extractFromDate: value must be of type Date');
    switch(part) {
        case DatePart.Year: return value.getFullYear();
        case DatePart.Month: return value.getMonth();
        case DatePart.Day: return value.getDate();
        case DatePart.Hour: return value.getHours();
        case DatePart.Minute: return value.getMinutes();
        case DatePart.Second: return value.getSeconds();
    }
} 

/**
 * Converts a birthdate into the current age.
 * @param the birthdate in StoreDate format (i.e. yyyymmdd)
 * @param byDecade if true, the age is returned in decades, otherwise in years
 * @param refYear the reference year for the calculation (default is the current year)
 *  if false: the age in years is returned
 *  if true: the age in decades is returned, i.e. 45 years = 4 decades, 8 years = 0 decades
 */
export function getAge(dateOfBirth: string, byDecade = false, refYear = getYear()): number {
  if (!dateOfBirth || dateOfBirth.length !== 8) return -1;
  const _birthYear = Number(convertDateFormat(dateOfBirth, DateFormat.StoreDate, DateFormat.Year));
  const _ageInYears =  refYear - _birthYear;
  return byDecade === true ? Math.floor(_ageInYears / 10) : _ageInYears;
}

export function getDifferenceInHours(date1: Date, date2: Date): number {
  return differenceInHours(date1, date2);
}

/**
 * Returns the weekday of a date.
 * @param date 
 * @returns 7 for Sunday, 1 for Monday, 2 for Tuesday, etc.
 */
export function getWeekday(date: Date | number): number {
  return getISODay(date);
}

export function getWeekdayI18nKey(date: Date | number): string {
  switch(getWeekday(date)) {
    case 1: return 'event.weekDay.monday';
    case 2: return 'event.weekDay.tuesday';
    case 3: return 'event.weekDay.wednesday';
    case 4: return 'event.weekDay.thursday';
    case 5: return 'event.weekDay.friday';
    case 6: return 'event.weekDay.saturday';
    case 7: return 'event.weekDay.sunday';
    default: die('date.util/getWeekdayI18nKey: invalid weekday: ' + getWeekday(date));
  }
}

/* ------------------- date format validations ----------------------- */
/**
 * Checks the content of a date field.
 * Returns either true if all checks were successful.
 * @param fieldName the name of the field (for logging purpose only)
 * @param value the value to check
 * @param dateFormat the required date format of the value
 * @param isStrict for optional fields the field may be empty
 */
export function checkDate(fieldName: string, value: string, dateFormat: DateFormat, minYear: number, maxYear: number, isStrict: boolean): boolean {
    const _date = parseDate(value, dateFormat, isStrict);
    if (!_date) {
        if (isStrict === true) {
            warn(`date.util/checkDate: date ${fieldName} is mandatory`);
            return false;
        } else {
            return true;
        }
    }
    if (!isValid(_date)) {
        warn(`date.util/checkDate: date ${fieldName} is not valid`);
        return false;
    }
    if (checkYearRange(extractFromDate(_date, DatePart.Year), minYear, maxYear) === true) {
        return true;
    } else {
        warn(`date.util/checkDate: date ${fieldName} is out of range`);
        return false;
    }
}

// checks whether a relationship has already been ended or will be ended in the future
/**
 * Checks whether an object with a validity period from startDate to endDate is ongoing.
 * 'Ongoing' means that the validity period has not yet ended, not in the past nor future.
 * 
 * @param endDate the end of the validity period, can be END_FUTURE_DATE_STR
 * @returns true if the validity period is ongoing, false otherwise
 */
export function isOngoing(endDate: string): boolean {
  return endDate === END_FUTURE_DATE_STR;
}

// checks whether a relationship 
/**
 * Checks whether an object with a validity period from startDate to endDate is valid at a given date (refDate).
 * @param startDate the start of the validity period
 * @param endDate the end of the validity period, can be END_FUTURE_DATE_STR
 * @param refDate the reference date to check the validity against, default is to check against today
 * @returns true if the refDate is between startDate and endDate, false otherwise
 */
export function isValidAt(startDate: string, endDate: string, refDate = getTodayStr()): boolean {
  if (startDate.length === 0) { // no startDate
    if (endDate === END_FUTURE_DATE_STR || endDate.length === 0) return true;
    return isAfterDate(endDate, refDate);
  } else { // valid startDate
    if (isAfterDate(startDate, refDate)) return false;
    // now, startDate is equal or before refDate
    if (endDate === END_FUTURE_DATE_STR) return true;
    return isAfterDate(endDate, refDate);  
  }
}

/**
 * Validates whether the given year is between the configured min and max values.
 * @param year the given year in number format
 */
export function checkYearRange(year: unknown, minYear: number, maxYear: number): boolean {
    if (!year) die('date.util/checkYearRange: invalid year');
    if (typeof year !== 'number') die('date.util/checkYearRange: year must be a number');
    return year >= minYear && year <= maxYear;
}

/**
 * Returns the year of a date as a number. 
 * @param yearDiff returns the year(s) before the current year; default is to return the current year.
 */
export function getYear(yearDiff = 0): number {
    return new Date().getFullYear() + yearDiff;
}

export function getYearFromDate(date: string, dateFormat = DateFormat.StoreDate): number {
  const _yearStr = convertDateFormatToString(date, dateFormat, DateFormat.Year, false);    // yyyy
  return parseInt(_yearStr, 10);
}

export function getStartOfYear(yearDiff = 0): number {
    return getYear(yearDiff) * 10000 + 101;
}

export function getEndOfYear(yearDiff = 0): number {
    return getYear(yearDiff) * 10000 + 1231;
}

/**
 * Calculates the difference in years between two dates provided as strings.
 *
 * @param date1 - The first date as a string in the specified date format.
 * @param dateFormat - (Optional) The date format used for parsing and formatting dates. Default is StoreDate.
 * @param date2 - (Optional) The second date as a string in the specified date format. If not provided, the current date is used.
 *
 * @returns The difference in years between the two dates. A positive value indicates date2 is later than date1, and a negative value indicates date2 is earlier than date1.
 */
export function getYearDiff(date1: string, dateFormat = DateFormat.StoreDate, date2?: string): number {
  let _date2 = getTodayStr(dateFormat);
  if (date2 && date2.length > 0) _date2 = date2;
  const _year1 = Number(convertDateFormat(date1, dateFormat, DateFormat.Year))
  const _year2 = Number(convertDateFormat(_date2, dateFormat, DateFormat.Year))
  return _year2 - _year1;
}

/**
 * Compare two dates and return 1 if the first date is after the second, -1 if the firste date is before the second, and 0 if they are equal.
 * @param date1 first date
 * @param date2 second date
 * @param dateFormat the date format of the two dates (default is StoreDate = YYYYMMDD)
 * @returns -1, 0 or 1
 */
export function compareDate(date1: string, date2: string, dateFormat = DateFormat.StoreDate): number {
  if (date1 === END_FUTURE_DATE_STR) return 1;
  const _date1 = parseDate(date1, dateFormat, false) ?? die('date.util/compareDate: invalid date ' + date1);
  const _date2 = parseDate(date2, dateFormat, false) ?? die('date.util/compareDate: invalid date ' + date2);
  return compareAsc(_date1, _date2);
}

/**
 * Add number a duration to a given store date.
 * see https://date-fns.org/v3.3.1/docs/add
 * 
 * @param the date to add days to in dateFormat format
 * @param duration the date-fns duration object, e.g. { days: 1} for one day (years, months, weeks, days, hours, minutes, seconds) 
 * @param dateFormat the date format of the given date (default is StoreDate = YYYYMMDD), the function accepts a date in this format 
 * and returns the new date in the same format.
 * @returns a new storeDate with the added days in dateFormat format
 */
export function addDuration(storeDate: string, duration: Duration, dateFormat = DateFormat.StoreDate): string {
  const _date = parseDate(storeDate, dateFormat, false) ?? die('date.util/addDays: invalid date ' + storeDate);
  const _date2 = add(_date, duration);
  return format(_date2, dateFormat);
}

export function getTodayStr(dateFormat = DateFormat.StoreDate, yearDiff = 0): string {
    const _date = new Date();
    _date.setFullYear(getYear(yearDiff));
    return format(_date, dateFormat);
}

/**
 * Get the current time.
 * @returns the current time in HH:MM format
 */
export function getCurrentTime(): string {
    return format(new Date(), DateFormat.Time);
}

/**
 * Simplified version of addDuration explicitely for time. Default is to add 1 hour to the current time.
 * @param time  the time to add hours to in HH:MM format
 * @param hours the number of hours to add
 * @param minutes the number of minutes to add
 * @returns the new time in HH:MM format
 */
export function addTime(time?: string, hours = 1, minutes = 0): string {
  if (!time || time.length !== 5) return '';    // time is optional
  const _date = parse(time, DateFormat.Time, new Date());
  if (!_date) die('date.util/addTime: invalid time ' + time);
  const _date2 = add(_date, { hours, minutes });
  return format(_date2, DateFormat.Time);
}

/**
 * This method calculates the number of calendar days until the next birthday of the given birthdate.
 * @param storeDate the birthdate in DateFormat.StoreDate format
 * @returns the number of calendar days until the next birthday
 */
export function getBirthdayDiff(storeDate: string): number {
    const _currentYear = getTodayStr(DateFormat.Year);
    let _nextBirthdateStr = _currentYear + storeDate.substring(4);
    if (_nextBirthdateStr <= getTodayStr(DateFormat.StoreDate)) {
        _nextBirthdateStr = (Number(_currentYear) + 1) + storeDate.substring(4);
    }
    const _today = new Date();
    const _nextBirthdate = parseDate(_nextBirthdateStr, DateFormat.StoreDate);
    return !_nextBirthdate ? -1 : differenceInCalendarDays(_nextBirthdate, _today);
}

/**
 * Returns the number of days between two dates.
 * @param fromDate the start date in StoreDate format
 * @param toDate the end date in StoreDate format
 * @returns the number of days between fromDate and toDate
 */
export function getDayDiff(fromDate: string, toDate: string): number {
    const _fromDate = parseDate(fromDate, DateFormat.StoreDate);
    const _toDate = parseDate(toDate, DateFormat.StoreDate);
    return !_fromDate || !_toDate ? -1 : differenceInCalendarDays(_toDate, _fromDate);
}

export function isFutureDate(date: string, dateFormat = DateFormat.StoreDate): boolean {
    const _parsedDate = parseDate(date, dateFormat);
    if (!_parsedDate) die('date.util/isFutureDate: could not parse date ' + date);
    return isFuture(_parsedDate);
}

/**
 * Returns true if date1 is after date2.
 * @param date1 a date in StoreDate format
 * @param date2 a date in StoreDate format
 * @returns true if date1 is after date2
 */
export function isAfterDate(date1: string, date2:string): boolean {
  // END_FUTURE_DATE_STR is always after any date
  if (date1 === END_FUTURE_DATE_STR) return true;
  const _date1 = parseDate(date1, DateFormat.StoreDate);
  const _date2 = parseDate(date2, DateFormat.StoreDate);
  if (!_date1 || !_date2) return false;
  return isAfter(_date1, _date2);
}

export function isAfterOrEqualDate(date1: string, date2:string): boolean {
  if (date1.startsWith(date2)) return true;
  return isAfterDate(date1, date2);
}

export function copyDate(origDate: Date): Date {
    const _copiedDate = new Date();
    _copiedDate.setTime(origDate.getTime());
    return _copiedDate;
}

/**
 * creates an array of years
 * e.g. [2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015]
 * default is to return the eight last years including the current year
 * @param startYear 
 * @param numberOfYears 
 * @returns the array of years
 */
export function getYearList(startYear = getYear(), numberOfYears = 8): number[] {
    const _yearList: number[] = [];
    for (let i = 0; i < numberOfYears; i++) {
        _yearList.push(startYear - i);
    }
    return _yearList;
}

export function migrateDate(dateStr: string, isOptional: boolean): string {
    if (!dateStr || dateStr.length < 8) return (isOptional === true) ? '' : '20000101120000';
    if (dateStr.length === 8) return dateStr + '120000';
    return dateStr;
}

export function getFormatFromDateLength(dateStr: string): DateFormat | undefined {
  if (!dateStr || dateStr.length === 0) return undefined;
  switch(dateStr.length) {
    case 4: return DateFormat.Year;
    case 8: return DateFormat.StoreDate;
    case 14: return DateFormat.StoreDateTime;
    default: 
      warn(`date.util/getFormatFromDateLength: date <${dateStr}> has invalid date length ${dateStr.length}; should be 4, 8 or 14.`);
      return undefined;
  }
}

/**
 * Returns a string showing the duration in years between two dates.
 * e.g. 2018 - 2023,  2020 -, ? - 2021
 * Both dates need to be in a stringified format (YEAR, STORE_DATE or STORE_DATETIME).
 * @param fromDate 
 * @param toDate 
 * @param toFormat the format to convert that date to, default is just a year (YYYY).
 */
export function getDuration(fromDate: string, toDate: string, toFormat = DateFormat.Year): string {
  const _fromDate = convertDateFromAnyFormatToString(fromDate, toFormat);
  const _toDate = convertDateFromAnyFormatToString(toDate, toFormat);
  if (!_fromDate) {
    return !_toDate ? '' : '? - ' + _toDate;
  } else if (!_toDate || _toDate === END_FUTURE_DATE_STR) {
      return _fromDate + ' - ...';
  } else {
    return _fromDate + ' - ' + _toDate;
  }
}

/**
 * This method helps to fill out the validFrom and validTo dates if the user only inserted one.
 * Typically, a reservation is same day and the user inputs the validFrom plus startTime and endTime.
 * In such a case, if the validTo date is not set, we set the date to the same as validFrom.
 * In contrast, a memership is typically neither terminated nor same day. Therefore, it uses END_FUTURE_DATE_STR.
 * @param validFrom 
 * @param validTo 
 * @returns two strings in an array:  [validFrom, validTo]
 */
export function fixDuration(validFrom: string, validTo: string, sameDay = true): string[] {
  if (sameDay === true) {
    if (validFrom.length > 0) { // we have a valid validFrom date
      return validTo.length === 0 ? [validFrom, validFrom] : [validFrom, validTo];
    } else {
      return validTo.length === 0 ? ['', ''] : [validTo, validTo];
    }  
  } else if (validFrom.length > 0) { // we have a valid validFrom date
      return validTo.length === 0 ? [validFrom, END_FUTURE_DATE_STR] : [validFrom, validTo];
    } else {
      return validTo.length === 0 ? ['', ''] : [validTo, validTo];
    }
}

// yyyyMMdd -> yyyy
export function getYearStrFromDate(date: string): string {
  if (!date || date.length !== 8) die('date.util/getYearStrFromDate: invalid date ' + date);
  return date.substring(0, 4);
}
// yyyyMMdd -> MM
export function getMonthFromDate(date: string): string {
  if (!date || date.length !== 8) die('date.util/getMonthFromDate: invalid date ' + date);
  return date.substring(4, 6);
}

// yyyyMMdd -> dd
export function getDayFromDate(date: string): string {
  if (!date || date.length !== 8) die('date.util/getMonthFromDate: invalid date ' + date);
  return date.substring(6, 8);
}

// 12:15 -> 12
export function getHourFromTime(time: string): string {
  if (!time || time.length !== 5) die('date.util/getHourFromTime: invalid time ' + time);
  return time.substring(0, 2);
}

// 12:15 -> 15
export function getMinutesFromTime(time: string): string {
  if (!time || time.length !== 5) die('date.util/getMinutesFromTime: invalid time ' + time);
  return time.substring(3, 5);
}

// yyyyMMdd hh:mm -> yyyy-MM-ddTHH:mm:ss
export function getIsoDateTime(date: string, time: string): string {
  if (!date || date.length !== 8) die('date.util/getIsoDateTime: invalid date ' + date);
  if (!time || time.length !== 5) die('date.util/getIsoDateTime: invalid time ' + time);
  return getYearStrFromDate(date) + '-' + getMonthFromDate(date) + '-' + getDayFromDate(date) + 'T' + time + ':00';
}
