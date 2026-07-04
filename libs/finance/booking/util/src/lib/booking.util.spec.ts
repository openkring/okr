import { describe, it, expect } from 'vitest';
import { BookingLineModel, BookingModel } from '@okr/shared-models';
import {
  bookingYear,
  formatMinorAmount,
  generateBookingNo,
  journalToRows,
  matchesJournalSearch,
  toJournalRow,
  validateBookingBalance,
  type JournalRow,
} from './booking.util';

function makeBooking(overrides: Partial<BookingModel> = {}): BookingModel {
  const b = new BookingModel('t1', 'org1');
  b.okey = 'b1';
  b.date = '20260315';
  b.title = 'Mitgliederbeitrag';
  b.bookingNo = 42;
  return Object.assign(b, overrides);
}

describe('validateBookingBalance', () => {
  it('returns true when Σ debit equals Σ credit in cents', () => {
    const lines: Partial<BookingLineModel>[] = [
      { debitAmount:  { amount: 10000, currency: 'CHF', periodicity: 'one-time' } },
      { creditAmount: { amount: 10000, currency: 'CHF', periodicity: 'one-time' } },
    ];
    expect(validateBookingBalance(lines as BookingLineModel[])).toBe(true);
  });

  it('returns false when Σ debit does not equal Σ credit', () => {
    const lines: Partial<BookingLineModel>[] = [
      { debitAmount:  { amount: 10000, currency: 'CHF', periodicity: 'one-time' } },
      { creditAmount: { amount:  9000, currency: 'CHF', periodicity: 'one-time' } },
    ];
    expect(validateBookingBalance(lines as BookingLineModel[])).toBe(false);
  });

  it('returns true for empty lines (zero = zero)', () => {
    expect(validateBookingBalance([])).toBe(true);
  });

  it('handles multi-line bookings correctly', () => {
    const lines: Partial<BookingLineModel>[] = [
      { debitAmount:  { amount: 6000, currency: 'CHF', periodicity: 'one-time' } },
      { debitAmount:  { amount: 4000, currency: 'CHF', periodicity: 'one-time' } },
      { creditAmount: { amount: 10000, currency: 'CHF', periodicity: 'one-time' } },
    ];
    expect(validateBookingBalance(lines as BookingLineModel[])).toBe(true);
  });
});

describe('bookingYear', () => {
  it('extracts the year from a yyyymmdd StoreDate', () => {
    expect(bookingYear(makeBooking({ date: '20260315' }))).toBe(2026);
  });
  it('returns 0 when the date is empty/too short', () => {
    expect(bookingYear(makeBooking({ date: '' }))).toBe(0);
    expect(bookingYear(makeBooking({ date: '202' }))).toBe(0);
  });
});

describe('formatMinorAmount', () => {
  it('formats minor units as Swiss major units with two decimals', () => {
    expect(formatMinorAmount(123450)).toBe("1'234.50");
    expect(formatMinorAmount(0)).toBe('0.00');
    expect(formatMinorAmount(5)).toBe('0.05');
  });
});

describe('toJournalRow', () => {
  const accountIdByKey = new Map<string, string>([
    ['acc-credit', '1020'],
    ['acc-debit', '6000'],
  ]);

  it('maps credit/debit account ids, the total and the title', () => {
    const lines: Partial<BookingLineModel>[] = [
      { accountKey: 'acc-debit',  debitAmount:  { amount: 10000, currency: 'CHF', periodicity: 'one-time' } },
      { accountKey: 'acc-credit', creditAmount: { amount: 10000, currency: 'CHF', periodicity: 'one-time' } },
    ];
    const row = toJournalRow(makeBooking(), lines as BookingLineModel[], accountIdByKey);
    expect(row.date).toBe('15.03.2026');
    expect(row.year).toBe(2026);
    expect(row.creditAccount).toBe('1020');
    expect(row.debitAccount).toBe('6000');
    expect(row.accountName).toBe('Mitgliederbeitrag');
    expect(row.amount).toBe('100.00');
    expect(row.currency).toBe('CHF');
  });

  it('joins multiple accounts on the same side and leaves date empty when unset', () => {
    const lines: Partial<BookingLineModel>[] = [
      { accountKey: 'acc-debit',  debitAmount:  { amount: 6000, currency: 'CHF', periodicity: 'one-time' } },
      { accountKey: 'acc-credit', debitAmount:  { amount: 4000, currency: 'CHF', periodicity: 'one-time' } },
      { accountKey: 'acc-credit', creditAmount: { amount: 10000, currency: 'CHF', periodicity: 'one-time' } },
    ];
    const row = toJournalRow(makeBooking({ date: '' }), lines as BookingLineModel[], accountIdByKey);
    expect(row.date).toBe('');
    expect(row.debitAccount).toBe('6000, 1020');
    expect(row.amount).toBe('100.00');
  });
});

describe('matchesJournalSearch', () => {
  const row: JournalRow = {
    booking: makeBooking(),
    okey: 'b1',
    date: '15.03.2026',
    year: 2026,
    creditAccount: '1020',
    debitAccount: '6000',
    accountName: 'Mitgliederbeitrag',
    amount: '100.00',
    currency: 'CHF',
  };

  it('matches on empty term', () => {
    expect(matchesJournalSearch(row, '')).toBe(true);
    expect(matchesJournalSearch(row, '   ')).toBe(true);
  });
  it('matches case-insensitively on title, account, date, amount and bookingNo', () => {
    expect(matchesJournalSearch(row, 'mitglied')).toBe(true);
    expect(matchesJournalSearch(row, '1020')).toBe(true);
    expect(matchesJournalSearch(row, '15.03')).toBe(true);
    expect(matchesJournalSearch(row, '100.00')).toBe(true);
    expect(matchesJournalSearch(row, '42')).toBe(true);
  });
  it('does not match unrelated terms', () => {
    expect(matchesJournalSearch(row, 'xyz')).toBe(false);
  });
});

describe('journalToRows', () => {
  it('prepends a header row and flattens the display columns', () => {
    const row: JournalRow = {
      booking: makeBooking(),
      okey: 'b1', date: '15.03.2026', year: 2026,
      creditAccount: '1020', debitAccount: '6000',
      accountName: 'Mitgliederbeitrag', amount: '100.00', currency: 'CHF',
    };
    const rows = journalToRows([row], { date: 'Datum', credit: 'Haben', debit: 'Soll', name: 'Text', amount: 'Betrag' });
    expect(rows[0]).toEqual(['Datum', 'Haben', 'Soll', 'Text', 'Betrag']);
    expect(rows[1]).toEqual(['15.03.2026', '1020', '6000', 'Mitgliederbeitrag', '100.00']);
  });
});

describe('generateBookingNo', () => {
  it('formats as YYYY-NNNNNN with zero-padding', () => {
    expect(generateBookingNo(2026, 1)).toBe('2026-000001');
    expect(generateBookingNo(2026, 999)).toBe('2026-000999');
    expect(generateBookingNo(2026, 1000000)).toBe('2026-1000000');
  });
});
