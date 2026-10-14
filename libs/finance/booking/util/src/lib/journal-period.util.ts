import { BookingLineModel, BookingModel } from '@okr/shared-models';

import { accountClass, signedBalance } from '@okr/finance-reporting-util';

/**
 * The journal loads one period progressively instead of the whole ledger (spec 1.102). These are the
 * pure parts: which dates to load, and the opening balance a running saldo needs when the loaded
 * period does not reach back to where that saldo starts. Dates are StoreDates (yyyymmdd), amounts
 * minor units.
 */

/** Sentinel of okr-year-select for «Alle Jahre». */
export const JOURNAL_ALL_YEARS = 99;

/** Date range to load, inclusive; '' = open end. */
export interface JournalRange {
  from: string;
  to: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The bookings the journal loads: the calendar year the list filters on (and optionally one month of
 * it); «Alle Jahre» loads everything. Whatever a running saldo needs before that comes in as an
 * opening balance (`needsOpeningBalance`).
 */
export function journalLoadRange(year: number, month: number): JournalRange {
  if (year === JOURNAL_ALL_YEARS) return { from: '', to: '' };
  if (month >= 1 && month <= 12) {
    const lastDay = new Date(year, month, 0).getDate();
    return { from: `${year}${pad2(month)}01`, to: `${year}${pad2(month)}${pad2(lastDay)}` };
  }
  return { from: `${year}0101`, to: `${year}1231` };
}

/**
 * Where a running saldo starts: balance-sheet accounts (1, 2) carry forward from the ledger's start
 * (''), Erfolgsrechnung accounts restart at the period start.
 */
export function saldoStart(accountId: string, periodFrom: string): string {
  const cls = accountClass(accountId);
  return cls === 'assets' || cls === 'liabilities' ? '' : periodFrom;
}

/** Whether the loaded range starts after the saldo start — then the opening balance must be read. */
export function needsOpeningBalance(accountId: string, periodFrom: string, rangeFrom: string): boolean {
  if (!rangeFrom) return false;
  return saldoStart(accountId, periodFrom) < rangeFrom;
}

/**
 * Saldo of one account from its saldo start up to (excluding) `before`, over posted bookings only.
 * Lines carry no date, so each is joined to its booking.
 */
export function openingBalance(
  lines: BookingLineModel[],
  bookings: BookingModel[],
  accountKey: string,
  accountId: string,
  periodFrom: string,
  before: string,
): number {
  const start = saldoStart(accountId, periodFrom);
  const cls = accountClass(accountId);
  const inRange = new Set(bookings
    .filter(b => b.status === 'posted' && (b.date ?? '') >= start && (b.date ?? '') < before)
    .map(b => b.okey));
  let saldo = 0;
  for (const line of lines) {
    if (line.accountKey !== accountKey || !inRange.has(line.bookingKey)) continue;
    saldo += signedBalance(cls, { debit: line.debitAmount?.amount ?? 0, credit: line.creditAmount?.amount ?? 0 });
  }
  return saldo;
}

/** The year picker: every fiscal year that has a period, plus the current year — newest first. */
export function journalYearOptions(periodYears: number[], currentYear: number): number[] {
  return [...new Set([currentYear, ...periodYears.filter(y => y > 0)])].sort((a, b) => b - a);
}
