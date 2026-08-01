import { describe, expect, it } from 'vitest';

import { formatRejectNote, isBalanced, nextBookingNo } from './booking-review.util';

describe('nextBookingNo', () => {
  it('starts at 1 for an empty ledger', () => {
    expect(nextBookingNo([], 2026)).toBe(1);
  });

  it('continues the sequence of the requested year', () => {
    const bookings = [
      { date: '20260115', bookingNo: 1 },
      { date: '20260220', bookingNo: 2 },
      { date: '20260301', bookingNo: 3 },
    ];
    expect(nextBookingNo(bookings, 2026)).toBe(4);
  });

  it('ignores bookings of other years', () => {
    const bookings = [
      { date: '20251231', bookingNo: 87 },
      { date: '20260105', bookingNo: 1 },
      { date: '20270101', bookingNo: 40 },
    ];
    expect(nextBookingNo(bookings, 2026)).toBe(2);
  });

  it('never reuses a gap left by a cancelled booking', () => {
    const bookings = [
      { date: '20260115', bookingNo: 1 },
      { date: '20260220', bookingNo: 0 },  // cancelled / forReview — unnumbered
      { date: '20260301', bookingNo: 3 },
    ];
    expect(nextBookingNo(bookings, 2026)).toBe(4);
  });

  it('ignores undated and unnumbered bookings', () => {
    const bookings = [
      { date: '', bookingNo: 99 },
      { date: '20260115' },
      { bookingNo: 12 },
    ];
    expect(nextBookingNo(bookings, 2026)).toBe(1);
  });
});

describe('formatRejectNote', () => {
  it('creates the first note entry', () => {
    expect(formatRejectNote('', '01.08.2026', 'R. Meier', 'Beleg unleserlich'))
      .toBe('[Abgelehnt 01.08.2026, R. Meier] Beleg unleserlich');
  });

  it('appends to existing notes instead of overwriting them', () => {
    const existing = 'OCR-Betrag weicht ab: 45.20 statt 45.00';
    expect(formatRejectNote(existing, '01.08.2026', 'R. Meier', 'privat'))
      .toBe('OCR-Betrag weicht ab: 45.20 statt 45.00\n[Abgelehnt 01.08.2026, R. Meier] privat');
  });

  it('trims surrounding whitespace of notes, reviewer and reason', () => {
    expect(formatRejectNote('  vorher  ', '01.08.2026', ' R. Meier ', '  kein Beleg  '))
      .toBe('vorher\n[Abgelehnt 01.08.2026, R. Meier] kein Beleg');
  });
});

describe('isBalanced', () => {
  it('accepts a balanced two-line booking', () => {
    expect(isBalanced([
      { debitAmount: { amount: 4520 } },
      { creditAmount: { amount: 4520 } },
    ])).toBe(true);
  });

  it('accepts a split booking whose sides sum equal', () => {
    expect(isBalanced([
      { debitAmount: { amount: 3000 } },
      { debitAmount: { amount: 1520 } },
      { creditAmount: { amount: 4520 } },
    ])).toBe(true);
  });

  it('rejects an unbalanced booking', () => {
    expect(isBalanced([
      { debitAmount: { amount: 4520 } },
      { creditAmount: { amount: 4500 } },
    ])).toBe(false);
  });

  it('rejects a zero-total booking', () => {
    expect(isBalanced([
      { debitAmount: { amount: 0 } },
      { creditAmount: { amount: 0 } },
    ])).toBe(false);
  });

  it('rejects an empty line set', () => {
    expect(isBalanced([])).toBe(false);
  });
});
