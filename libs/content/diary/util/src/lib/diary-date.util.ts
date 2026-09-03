import { DiaryScope } from '@okr/shared-models';

/** The oldest year the archive holds material for (a 1938 album); the year filter starts here. */
export const DIARY_FIRST_YEAR = 1930;

export interface DiaryDateParts {
  year: number;
  /** 0 when the scope does not resolve it */
  month: number;
  /** 0 when the scope does not resolve it */
  day: number;
}

/**
 * The ONLY place that takes a `DiaryModel.date` apart. It is 'yyyyMMdd' with zeroed
 * components for month/year aggregates (see DiaryScope), so nothing here may call
 * Date/date-fns on the raw string — that is exactly what breaks on '19900000'.
 */
export function splitDiaryDate(date: string): DiaryDateParts | undefined {
  if (!/^\d{8}$/.test(date)) return undefined;
  return { year: Number(date.slice(0, 4)), month: Number(date.slice(4, 6)), day: Number(date.slice(6, 8)) };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Builds the store date for a scope, zeroing what the scope does not resolve. */
export function composeDiaryDate(scope: DiaryScope, year: number, month = 0, day = 0): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return '';
  const m = scope === 'year' ? 0 : month;
  const d = scope === 'day' ? day : 0;
  return `${year}${pad2(m)}${pad2(d)}`;
}

/** True only for a real calendar day — the zeroed dates of aggregates are rejected. */
export function isDiaryCalendarDay(date: string): boolean {
  const parts = splitDiaryDate(date);
  if (!parts || parts.month < 1 || parts.month > 12 || parts.day < 1) return false;
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return probe.getUTCFullYear() === parts.year
    && probe.getUTCMonth() === parts.month - 1
    && probe.getUTCDate() === parts.day;
}

/** Does the zero pattern of `date` say what `scope` claims? */
export function diaryDateMatchesScope(date: string, scope: DiaryScope): boolean {
  const parts = splitDiaryDate(date);
  if (!parts) return false;
  switch (scope) {
    case 'day':   return isDiaryCalendarDay(date);
    case 'month': return parts.month >= 1 && parts.month <= 12 && parts.day === 0;
    case 'year':  return parts.month === 0 && parts.day === 0;
  }
}

export function diaryYearOf(date: string): number | undefined {
  return splitDiaryDate(date)?.year;
}

/**
 * Query bounds for one year. 'yyyy0000' is the year aggregate itself, 'yyyy1231' the last day —
 * both inclusive, so the range holds every day, every month aggregate and the year aggregate.
 */
export function diaryYearBounds(year: number): { from: string; to: string } {
  return { from: `${year}0000`, to: `${year}1231` };
}

/** Newest first, for okr-list-filter's year dropdown. */
export function diaryYearList(): number[] {
  const thisYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = thisYear; y >= DIARY_FIRST_YEAR; y--) years.push(y);
  return years;
}
