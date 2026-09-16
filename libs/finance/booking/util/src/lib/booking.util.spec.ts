import { describe, it, expect } from 'vitest';
import { BookingLineModel, BookingModel } from '@okr/shared-models';
import { bookingValidations } from './booking.validations';
import {
  bookingMonth,
  bookingYear,
  copyBooking,
  emptyBookingPair,
  formatMinorAmount,
  linesToPairs,
  pairsToLines,
  pairsTotal,
  toBookingFormData,
  type BookingFormData,
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

describe('bookingMonth', () => {
  it('extracts the month from a yyyymmdd StoreDate', () => {
    expect(bookingMonth(makeBooking({ date: '20260315' }))).toBe(3);
    expect(bookingMonth(makeBooking({ date: '20261201' }))).toBe(12);
  });
  it('returns 0 when the date is empty/too short', () => {
    expect(bookingMonth(makeBooking({ date: '' }))).toBe(0);
    expect(bookingMonth(makeBooking({ date: '2026' }))).toBe(0);
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
    creditAccountName: '',
    debitAccountName: '',
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
      creditAccount: '1020', debitAccount: '6000', creditAccountName: '', debitAccountName: '',
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

describe('linesToPairs / pairsToLines', () => {
  const line = (accountKey: string, side: 'debit' | 'credit', amount: number, extra: Partial<BookingLineModel> = {}): BookingLineModel => {
    const l = new BookingLineModel('bka', 'bka');
    l.accountKey = accountKey;
    if (side === 'debit') l.debitAmount = { amount, currency: 'CHF', periodicity: 'one-time' };
    else l.creditAmount = { amount, currency: 'CHF', periodicity: 'one-time' };
    return Object.assign(l, extra);
  };

  it('a two-line booking is one pair carrying fx and vat', () => {
    const lines = [line('a6000', 'debit', 10000, { vatCodeKey: 'VST', amountFx: { amount: 9000, currency: 'EUR', periodicity: 'one-time' } }), line('a1020', 'credit', 10000)];
    expect(linesToPairs(lines)).toEqual([{ debitAccountKey: 'a6000', creditAccountKey: 'a1020', amount: 10000, amountFx: 9000, fxCurrency: 'EUR', vatCodeKey: 'VST', vatSide: 'debit' }]);
  });
  it('a split booking is one pair per credit; an unbalanced one leaves an open pair', () => {
    expect(linesToPairs([line('a1020', 'debit', 10000), line('a3000', 'credit', 6000), line('a3001', 'credit', 4000)])).toEqual([
      { debitAccountKey: 'a1020', creditAccountKey: 'a3000', amount: 6000, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit' },
      { debitAccountKey: 'a1020', creditAccountKey: 'a3001', amount: 4000, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit' },
    ]);
    expect(linesToPairs([line('a1020', 'debit', 10000), line('a3000', 'credit', 6000)])).toEqual([
      { debitAccountKey: 'a1020', creditAccountKey: 'a3000', amount: 6000, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit' },
      { debitAccountKey: 'a1020', creditAccountKey: '', amount: 4000, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit' },
    ]);
  });
  it('pairsToLines merges the same account and side, debit lines first', () => {
    const lines = pairsToLines([
      { debitAccountKey: 'a1020', creditAccountKey: 'a3000', amount: 6000, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit' },
      { debitAccountKey: 'a1020', creditAccountKey: 'a3001', amount: 4000, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: 'UST', vatSide: 'credit' },
    ], 'bka', 'bka', 'b1');
    expect(lines.map(l => [l.accountKey, l.debitAmount?.amount, l.creditAmount?.amount, l.vatCodeKey, l.bookingKey])).toEqual([
      ['a1020', 10000, undefined, '', 'b1'], ['a3000', undefined, 6000, '', 'b1'], ['a3001', undefined, 4000, 'UST', 'b1'],
    ]);
    expect(lines[0].amountFx).toBeUndefined();
  });
  it('round-trips a booking with fx', () => {
    const original = [line('a6000', 'debit', 10000, { amountFx: { amount: 9000, currency: 'EUR', periodicity: 'one-time' } }), line('a1020', 'credit', 10000, { amountFx: { amount: 9000, currency: 'EUR', periodicity: 'one-time' } })];
    const back = pairsToLines(linesToPairs(original), 'bka', 'bka', 'k');
    expect(back.map(l => [l.accountKey, l.debitAmount?.amount ?? l.creditAmount?.amount, l.amountFx?.amount])).toEqual([['a6000', 10000, 9000], ['a1020', 10000, 9000]]);
  });
  it('toBookingFormData seeds one empty pair for a new booking; pairsTotal sums', () => {
    const b = new BookingModel('bka', 'bka');
    expect(toBookingFormData(b, []).pairs).toEqual([emptyBookingPair()]);
    expect(pairsTotal([{ ...emptyBookingPair(), amount: 100 }, { ...emptyBookingPair(), amount: 250 }])).toBe(350);
  });
  it('toJournalRow carries the account names when given', () => {
    const b = new BookingModel('bka', 'bka'); b.date = '20260101'; b.title = 'x';
    const row = toJournalRow(b, [line('a6000', 'debit', 100), line('a1020', 'credit', 100)], new Map([['a6000', '6000'], ['a1020', '1020']]), new Map([['a6000', 'Miete'], ['a1020', 'ZKB']]));
    expect(row).toMatchObject({ creditAccount: '1020', debitAccount: '6000', creditAccountName: 'ZKB', debitAccountName: 'Miete' });
  });
});

describe('bookingValidations', () => {
  const ok: BookingFormData = { okey: '', title: 'Miete', date: '20260101', notes: '', counterparty: undefined,
    pairs: [{ debitAccountKey: 'a', creditAccountKey: 'b', amount: 100, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit' }] };
  it('accepts a complete booking and rejects a bad date, no pairs, an incomplete pair', () => {
    expect(bookingValidations(ok, '', '').isValid()).toBe(true);
    expect(bookingValidations({ ...ok, date: '2026-01-01' }, '', '').isValid()).toBe(false);
    expect(bookingValidations({ ...ok, pairs: [] }, '', '').isValid()).toBe(false);
    expect(bookingValidations({ ...ok, pairs: [{ ...ok.pairs[0], creditAccountKey: 'a' }] }, '', '').isValid()).toBe(false);
    expect(bookingValidations({ ...ok, pairs: [{ ...ok.pairs[0], amount: 0 }] }, '', '').isValid()).toBe(false);
    expect(bookingValidations({ ...ok, title: '' }, '', '').isValid()).toBe(false);
  });
});

describe('copyBooking', () => {
  function source(): { booking: BookingModel; lines: BookingLineModel[] } {
    const booking = new BookingModel('scs', 'gss');
    booking.okey = 'b1';
    booking.title = 'Mitgliederbeitrag';
    booking.date = '20250301';
    booking.notes = 'Notiz';
    booking.tags = 'spende';
    booking.bookingNo = 42;
    booking.status = 'posted';
    booking.documentKey = 'doc1';
    booking.periodKey = 'p2025';
    booking.counterparty = { key: 'p1', modelType: 'person', name1: 'Hans', name2: 'Muster', type: '', subType: '', label: 'Hans Muster' };
    const debit = new BookingLineModel('scs', 'gss');
    debit.okey = 'l1';
    debit.bookingKey = 'b1';
    debit.accountKey = 'a-bank';
    debit.debitAmount = { amount: 5000, currency: 'CHF' } as BookingLineModel['debitAmount'];
    debit.vatCodeKey = 'v1';
    const credit = new BookingLineModel('scs', 'gss');
    credit.okey = 'l2';
    credit.bookingKey = 'b1';
    credit.accountKey = 'a-revenue';
    credit.creditAmount = { amount: 5000, currency: 'CHF' } as BookingLineModel['creditAmount'];
    return { booking, lines: [debit, credit] };
  }

  it('keeps the text, counterparty and lines but dates the copy today', () => {
    const { booking, lines } = source();
    const copy = copyBooking(booking, lines, '20250916');
    expect(copy.booking.title).toBe('Mitgliederbeitrag');
    expect(copy.booking.notes).toBe('Notiz');
    expect(copy.booking.tags).toBe('spende');
    expect(copy.booking.counterparty).toEqual(booking.counterparty);
    expect(copy.booking.accountingTenantId).toBe('gss');
    expect(copy.booking.tenants).toEqual(['scs']);
    expect(copy.booking.date).toBe('20250916');
    expect(copy.lines.map(l => l.accountKey)).toEqual(['a-bank', 'a-revenue']);
    expect(copy.lines[0].debitAmount).toEqual({ amount: 5000, currency: 'CHF' });
    expect(copy.lines[1].creditAmount).toEqual({ amount: 5000, currency: 'CHF' });
    expect(copy.lines[0].vatCodeKey).toBe('v1');
  });

  it('drops everything that belongs to the original booking', () => {
    const { booking, lines } = source();
    const copy = copyBooking(booking, lines, '20250916');
    expect(copy.booking.okey).toBe('');
    expect(copy.booking.bookingNo).toBe(0);
    expect(copy.booking.status).toBe('draft');
    expect(copy.booking.documentKey).toBe('');   // no Beleg on the copy
    expect(copy.booking.periodKey).toBe('');
    expect(copy.lines.every(l => l.okey === '')).toBe(true);
    expect(copy.lines.every(l => l.bookingKey === '')).toBe(true);
  });

  it('leaves the original untouched', () => {
    const { booking, lines } = source();
    copyBooking(booking, lines, '20250916');
    expect(booking.okey).toBe('b1');
    expect(booking.date).toBe('20250301');
    expect(lines[0].bookingKey).toBe('b1');
  });
});
