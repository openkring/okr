import { describe, expect, it } from 'vitest';
import { BookingLineModel, BookingModel } from '@okr/shared-models';

import { monthGroupKey, monthGroupLabel, runningSaldoByBooking } from './journal-saldo.util';

const TENANT = 'scs';
const ATID = 'scsOrg';
const ACCOUNT = 'acc1';

function booking(okey: string, date: string, bookingNo: number, status: BookingModel['status'] = 'posted'): BookingModel {
  const b = new BookingModel(TENANT, ATID);
  b.okey = okey;
  b.date = date;
  b.bookingNo = bookingNo;
  b.status = status;
  return b;
}

function line(bookingKey: string, accountKey: string, debit: number, credit: number): BookingLineModel {
  const l = new BookingLineModel(TENANT, ATID);
  l.bookingKey = bookingKey;
  l.accountKey = accountKey;
  if (debit) l.debitAmount = { amount: debit, currency: 'CHF', periodicity: 'one-time' };
  if (credit) l.creditAmount = { amount: credit, currency: 'CHF', periodicity: 'one-time' };
  return l;
}

function linesMap(...lines: BookingLineModel[]): Map<string, BookingLineModel[]> {
  const map = new Map<string, BookingLineModel[]>();
  for (const l of lines) map.set(l.bookingKey, [...(map.get(l.bookingKey) ?? []), l]);
  return map;
}

describe('runningSaldoByBooking', () => {
  it('accumulates debit-positive on an Aktivkonto, in date order', () => {
    const bookings = [booking('b2', '20260215', 2), booking('b1', '20260110', 1)];
    const lines = linesMap(line('b1', ACCOUNT, 1000, 0), line('b2', ACCOUNT, 0, 400));
    const saldi = runningSaldoByBooking(bookings, lines, ACCOUNT, '1020', '20260101');
    expect(saldi.get('b1')).toBe(1000);
    expect(saldi.get('b2')).toBe(600);
  });

  it('accumulates credit-positive on a Passiv-/Ertragskonto', () => {
    const bookings = [booking('b1', '20260110', 1)];
    const lines = linesMap(line('b1', ACCOUNT, 0, 2500));
    expect(runningSaldoByBooking(bookings, lines, ACCOUNT, '3000', '20260101').get('b1')).toBe(2500);
  });

  it('carries a balance-sheet account forward across the period start', () => {
    const bookings = [booking('b0', '20251201', 9), booking('b1', '20260110', 1)];
    const lines = linesMap(line('b0', ACCOUNT, 500, 0), line('b1', ACCOUNT, 100, 0));
    const saldi = runningSaldoByBooking(bookings, lines, ACCOUNT, '1020', '20260101');
    expect(saldi.get('b1')).toBe(600);
  });

  it('restarts an Erfolgsrechnungskonto at the period start', () => {
    const bookings = [booking('b0', '20251201', 9), booking('b1', '20260110', 1)];
    const lines = linesMap(line('b0', ACCOUNT, 0, 500), line('b1', ACCOUNT, 0, 100));
    const saldi = runningSaldoByBooking(bookings, lines, ACCOUNT, '3000', '20260101');
    expect(saldi.has('b0')).toBe(false);
    expect(saldi.get('b1')).toBe(100);
  });

  it('ignores lines of other accounts and bookings that are not posted', () => {
    const bookings = [booking('b1', '20260110', 1), booking('b2', '20260120', 2, 'forReview')];
    const lines = linesMap(line('b1', ACCOUNT, 1000, 0), line('b1', 'other', 0, 1000), line('b2', ACCOUNT, 700, 0));
    const saldi = runningSaldoByBooking(bookings, lines, ACCOUNT, '1020', '20260101');
    expect(saldi.get('b1')).toBe(1000);
    expect(saldi.has('b2')).toBe(false);
  });

  it('returns an empty map when no account is selected', () => {
    const bookings = [booking('b1', '20260110', 1)];
    const lines = linesMap(line('b1', ACCOUNT, 1000, 0));
    expect(runningSaldoByBooking(bookings, lines, '', '', '').size).toBe(0);
  });
});

describe('monthGroupKey / monthGroupLabel', () => {
  it('keys a booking by yyyymm and labels it in the locale', () => {
    expect(monthGroupKey(booking('b1', '20260610', 1))).toBe('202606');
    expect(monthGroupLabel('202606', 'de-CH')).toBe('Juni 2026');
  });

  it('yields no group for an unusable date', () => {
    expect(monthGroupKey(booking('b1', '', 1))).toBe('');
    expect(monthGroupLabel('')).toBe('');
  });
});
