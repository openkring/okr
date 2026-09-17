import { BookingLineModel, BookingModel } from '@okr/shared-models';

import { accountClass, signedBalance } from '@okr/finance-reporting-util';

import { bookingMonth, bookingYear } from './booking.util';

/**
 * Running account balance shown next to each journal row ("Saldo anzeigen"), plus the month
 * grouping labels ("Monatlich gruppieren"). Amounts are minor units (Rappen).
 *
 * The saldo is only defined for ONE account — the journal must be filtered on an account
 * (`?accountKey=`), otherwise a row belongs to two accounts at once and "the" balance has no
 * meaning. Sign follows the report convention (`signedBalance`): Aktiven/Aufwand debit-positive,
 * Passiven/Ertrag credit-positive.
 *
 * Accumulation start differs by account class, which is the accounting convention:
 * - balance-sheet accounts (1 Aktiven, 2 Passiven) carry forward, so they accumulate since the
 *   beginning of the ledger;
 * - Erfolgsrechnung accounts (3–9) are closed at the year end, so they restart at `periodFrom`.
 *
 * Only `posted` bookings move the balance — `draft`, `forReview` and `cancelled` are not in the
 * ledger. Such a row therefore has NO entry in the returned map (the list shows a dash), rather
 * than the misleading balance of the row above it.
 */
export function runningSaldoByBooking(
  bookings: BookingModel[],
  linesByBooking: Map<string, BookingLineModel[]>,
  accountKey: string,
  accountId: string,
  periodFrom: string,
): Map<string, number> {
  const saldi = new Map<string, number>();
  if (!accountKey) return saldi;
  const cls = accountClass(accountId);
  // balance-sheet accounts carry forward; P&L accounts restart with the period
  const from = cls === 'assets' || cls === 'liabilities' ? '' : periodFrom;

  const chronological = bookings
    .filter(b => b.status === 'posted' && (b.date ?? '') >= from)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.bookingNo ?? 0) - (b.bookingNo ?? 0));

  let saldo = 0;
  for (const booking of chronological) {
    let debit = 0;
    let credit = 0;
    for (const line of linesByBooking.get(booking.okey) ?? []) {
      if (line.accountKey !== accountKey) continue;
      debit += line.debitAmount?.amount ?? 0;
      credit += line.creditAmount?.amount ?? 0;
    }
    saldo += signedBalance(cls, { debit, credit });
    saldi.set(booking.okey, saldo);
  }
  return saldi;
}

/** Key a booking's month is grouped under, 'yyyymm' ('' when the date is unusable). */
export function monthGroupKey(booking: BookingModel): string {
  const year = bookingYear(booking);
  const month = bookingMonth(booking);
  return year > 0 && month > 0 ? `${year}${String(month).padStart(2, '0')}` : '';
}

/** Divider label of a 'yyyymm' group in the user's locale, e.g. 'Juni 2026'. */
export function monthGroupLabel(key: string, locale = 'de-CH'): string {
  if (key.length < 6) return '';
  const year = Number(key.substring(0, 4));
  const month = Number(key.substring(4, 6));
  if (!year || !month) return '';
  return new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}
