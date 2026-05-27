import { describe, it, expect } from 'vitest';
import { BookingLineModel } from '@bk2/shared-models';
import { validateBookingBalance, generateBookingNo } from './booking.util';

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

describe('generateBookingNo', () => {
  it('formats as YYYY-NNNNNN with zero-padding', () => {
    expect(generateBookingNo(2026, 1)).toBe('2026-000001');
    expect(generateBookingNo(2026, 999)).toBe('2026-000999');
    expect(generateBookingNo(2026, 1000000)).toBe('2026-1000000');
  });
});
