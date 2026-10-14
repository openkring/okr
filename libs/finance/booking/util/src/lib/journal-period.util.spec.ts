import { describe, expect, it } from 'vitest';
import { BookingLineModel, BookingModel } from '@okr/shared-models';

import { journalLoadRange, journalYearOptions, needsOpeningBalance, openingBalance, saldoStart } from './journal-period.util';
import { runningSaldoByBooking } from './journal-saldo.util';

const TENANT = 'scs';
const ATID = 'scs';
const BANK = 'bank';    // 1020
const COST = 'cost';    // 6000

function booking(okey: string, date: string, status: BookingModel['status'] = 'posted'): BookingModel {
  return Object.assign(new BookingModel(TENANT, ATID), { okey, date, bookingNo: 1, status });
}

function line(bookingKey: string, accountKey: string, debit: number, credit: number): BookingLineModel {
  const l = new BookingLineModel(TENANT, ATID);
  l.bookingKey = bookingKey;
  l.accountKey = accountKey;
  if (debit) l.debitAmount = { amount: debit, currency: 'CHF', periodicity: 'one-time' };
  if (credit) l.creditAmount = { amount: credit, currency: 'CHF', periodicity: 'one-time' };
  return l;
}

describe('journalLoadRange', () => {
  it('loads the calendar year', () => {
    expect(journalLoadRange(2026, 0)).toEqual({ from: '20260101', to: '20261231' });
  });
  it('loads one month', () => {
    expect(journalLoadRange(2026, 2)).toEqual({ from: '20260201', to: '20260228' });
    expect(journalLoadRange(2024, 2)).toEqual({ from: '20240201', to: '20240229' });
  });
  it('loads everything for «Alle Jahre»', () => {
    expect(journalLoadRange(99, 0)).toEqual({ from: '', to: '' });
  });
});

describe('saldoStart / needsOpeningBalance', () => {
  it('starts a balance-sheet account at the ledger start, a P&L account at the period', () => {
    expect(saldoStart('1020', '20260101')).toBe('');
    expect(saldoStart('6000', '20260101')).toBe('20260101');
  });
  it('needs an opening balance when the loaded range starts after the saldo start', () => {
    expect(needsOpeningBalance('1020', '20260101', '20260101')).toBe(true);    // bank, year view
    expect(needsOpeningBalance('6000', '20260101', '20260101')).toBe(false);   // P&L, year view
    expect(needsOpeningBalance('6000', '20260101', '20260301')).toBe(true);    // P&L, March only
    expect(needsOpeningBalance('1020', '', '')).toBe(false);                   // everything loaded
  });
});

describe('openingBalance', () => {
  const bookings = [
    booking('a', '20181231'),
    booking('b', '20250610'),
    booking('c', '20250620', 'cancelled'),
    booking('d', '20250630', 'forReview'),
    booking('e', '20260105'),
  ];
  const lines = [
    line('a', BANK, 50000, 0), line('b', BANK, 0, 2000), line('c', BANK, 0, 9999), line('d', BANK, 0, 7777),
    line('e', BANK, 1000, 0), line('b', COST, 2000, 0),
  ];
  it('sums posted lines of the account before the cut-off, from the ledger start for a balance-sheet account', () => {
    expect(openingBalance(lines, bookings, BANK, '1020', '20260101', '20260101')).toBe(48000);
  });
  it('restarts a P&L account at the period start', () => {
    expect(openingBalance(lines, bookings, COST, '6000', '20250101', '20260101')).toBe(2000);
    expect(openingBalance(lines, bookings, COST, '6000', '20260101', '20260301')).toBe(0);
  });
});

describe('runningSaldoByBooking with an opening balance', () => {
  it('continues from the opening balance', () => {
    const lines = new Map([['e', [line('e', BANK, 1000, 0)]]]);
    expect(runningSaldoByBooking([booking('e', '20260105')], lines, BANK, '1020', '20260101', 48000).get('e')).toBe(49000);
  });
});

describe('journalYearOptions', () => {
  it('lists the period years and the current year, newest first, without duplicates', () => {
    expect(journalYearOptions([2018, 2025, 2026, 2025, 0], 2026)).toEqual([2026, 2025, 2018]);
    expect(journalYearOptions([], 2026)).toEqual([2026]);
  });
});
