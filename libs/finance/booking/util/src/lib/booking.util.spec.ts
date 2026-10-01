import { describe, it, expect } from 'vitest';
import { AccountModel, AvatarInfo, BookingLineModel, BookingModel } from '@okr/shared-models';
import { bookingValidations } from './booking.validations';
import {
  addBookingPart,
  isSplitBookingTitle,
  removeBookingPart,
  splitBookingTitle,
  toAccountJournalRows,
  withSplitTitle,
  sideAccountKeys,
  bookingMonth,
  bookingYear,
  accountDefaultCostCenterKey,
  bookingWriteErrorReason,
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
  withPairAccount,
  type BookingPair,
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
    lineKey: '',
    date: '15.03.2026',
    year: 2026,
    creditAccount: '1020',
    debitAccount: '6000',
    creditAccountName: '',
    debitAccountName: '',
    accountName: 'Mitgliederbeitrag',
    amount: '100.00',
    currency: 'CHF',
    parts: [{ okey: '0', debitAccountId: '1020', debitAccountName: 'Bank', creditAccountId: '3407', creditAccountName: 'Spenden', text: 'Spende Jugend', amount: '100.00' }],
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
  it('matches the text of a split booking\'s parts', () => {
    expect(matchesJournalSearch(row, 'jugend')).toBe(true);
  });
  it('does not match unrelated terms', () => {
    expect(matchesJournalSearch(row, 'xyz')).toBe(false);
  });
});

describe('journalToRows', () => {
  it('prepends a header row and flattens the display columns', () => {
    const row: JournalRow = {
      booking: makeBooking(),
      okey: 'b1', lineKey: '', date: '15.03.2026', year: 2026, parts: [],
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
    expect(linesToPairs(lines)).toEqual([{ debitAccountKey: 'a6000', creditAccountKey: 'a1020', debitCostCenterKey: '', creditCostCenterKey: '', amount: 10000, amountFx: 9000, fxCurrency: 'EUR', vatCodeKey: 'VST', vatSide: 'debit', description: '', descriptionSide: 'debit' }]);
  });
  it('a split booking is one pair per credit; an unbalanced one leaves an open pair', () => {
    expect(linesToPairs([line('a1020', 'debit', 10000), line('a3000', 'credit', 6000), line('a3001', 'credit', 4000)])).toEqual([
      { debitAccountKey: 'a1020', creditAccountKey: 'a3000', debitCostCenterKey: '', creditCostCenterKey: '', amount: 6000, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit', description: '', descriptionSide: 'debit' },
      { debitAccountKey: 'a1020', creditAccountKey: 'a3001', debitCostCenterKey: '', creditCostCenterKey: '', amount: 4000, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit', description: '', descriptionSide: 'debit' },
    ]);
    expect(linesToPairs([line('a1020', 'debit', 10000), line('a3000', 'credit', 6000)])).toEqual([
      { debitAccountKey: 'a1020', creditAccountKey: 'a3000', debitCostCenterKey: '', creditCostCenterKey: '', amount: 6000, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit', description: '', descriptionSide: 'debit' },
      { debitAccountKey: 'a1020', creditAccountKey: '', debitCostCenterKey: '', creditCostCenterKey: '', amount: 4000, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit', description: '', descriptionSide: 'debit' },
    ]);
  });
  it('pairsToLines merges the same account and side, debit lines first', () => {
    const lines = pairsToLines([
      { debitAccountKey: 'a1020', creditAccountKey: 'a3000', debitCostCenterKey: '', creditCostCenterKey: '', amount: 6000, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit', description: '', descriptionSide: 'debit' },
      { debitAccountKey: 'a1020', creditAccountKey: 'a3001', debitCostCenterKey: '', creditCostCenterKey: '', amount: 4000, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: 'UST', vatSide: 'credit', description: '', descriptionSide: 'debit' },
    ], 'bka', 'bka', 'b1');
    expect(lines.map(l => [l.accountKey, l.debitAmount?.amount, l.creditAmount?.amount, l.vatCodeKey, l.bookingKey])).toEqual([
      ['a1020', 10000, undefined, '', 'b1'], ['a3000', undefined, 6000, '', 'b1'], ['a3001', undefined, 4000, 'UST', 'b1'],
    ]);
    expect(lines[0].amountFx).toBeUndefined();
  });
  it('round-trips the texts of a split bank booking and keeps the bank line whole', () => {
    // Gutschrift with processor fee: bank + fee debit, three counter parts credit, each with its text
    const original = [
      line('a1020', 'debit', 9700), line('a6941', 'debit', 300),
      line('a3000', 'credit', 6000, { description: 'Beitrag' }),
      line('a3610', 'credit', 3000, { description: 'Spende Jugend' }),
      line('a3610', 'credit', 1000, { description: 'Spende Material' }),
    ];
    const back = pairsToLines(linesToPairs(original), 'bka', 'bka', 'k');
    expect(back.map(l => [l.accountKey, l.debitAmount?.amount ?? l.creditAmount?.amount, l.description])).toEqual([
      ['a1020', 9700, ''], ['a6941', 300, ''],
      ['a3000', 6000, 'Beitrag'], ['a3610', 3000, 'Spende Jugend'], ['a3610', 1000, 'Spende Material'],
    ]);
  });
  it('round-trips the texts of a split Lastschrift (text on the debit parts)', () => {
    const original = [
      line('a6570', 'debit', 9000, { description: 'Bexio' }), line('a6500', 'debit', 3975, { description: 'Anteil B' }),
      line('a1020', 'credit', 12975),
    ];
    const pairs = linesToPairs(original);
    expect(pairs.map(p => [p.description, p.descriptionSide])).toEqual([['Bexio', 'debit'], ['Anteil B', 'debit']]);
    const back = pairsToLines(pairs, 'bka', 'bka', 'k');
    expect(back.map(l => [l.accountKey, l.description])).toEqual([['a6570', 'Bexio'], ['a6500', 'Anteil B'], ['a1020', '']]);
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
    pairs: [{ debitAccountKey: 'a', creditAccountKey: 'b', debitCostCenterKey: '', creditCostCenterKey: '', amount: 100, amountFx: 0, fxCurrency: 'EUR', vatCodeKey: '', vatSide: 'debit', description: '', descriptionSide: 'debit' }] };
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

  it('copies the Kostenstelle and text; a split over two Kostenstellen survives copy and re-merge', () => {
    const { booking } = source();
    const mk = (cc: string, amount: number): BookingLineModel => {
      const l = new BookingLineModel('scs', 'gss');
      l.accountKey = 'scs-6300'; l.costCenterKey = cc; l.description = 'T';
      l.debitAmount = { amount, currency: 'CHF' } as BookingLineModel['debitAmount'];
      return l;
    };
    const bank = new BookingLineModel('scs', 'gss');
    bank.accountKey = 'scs-1020';
    bank.creditAmount = { amount: 120000, currency: 'CHF' } as BookingLineModel['creditAmount'];
    const copy = copyBooking(booking, [mk('cc-jun', 70000), mk('cc-reg', 50000), bank], '20250916');
    expect(copy.lines.map(l => [l.costCenterKey, l.description])).toEqual([['cc-jun', 'T'], ['cc-reg', 'T'], ['', '']]);
    const back = pairsToLines(linesToPairs(copy.lines), 'scs', 'gss', 'b2');
    expect(back.filter(l => l.debitAmount).map(l => [l.costCenterKey, l.debitAmount?.amount])).toEqual([['cc-jun', 70000], ['cc-reg', 50000]]);
  });

  it('drops a copied Kostenstelle that is no longer an active leaf when the cost centres are passed', () => {
    const { booking } = source();
    const mk = (cc: string): BookingLineModel => {
      const l = new BookingLineModel('scs', 'gss');
      l.accountKey = 'scs-6300'; l.costCenterKey = cc;
      return l;
    };
    const centers = [
      { okey: 'cc-jun', parentKey: '', type: 'leaf' as const, accountingTenantId: 'gss' },
      { okey: 'cc-old', parentKey: '', type: 'leaf' as const, isArchived: true, accountingTenantId: 'gss' },
      { okey: 'cc-grp', parentKey: '', type: 'group' as const, accountingTenantId: 'gss' },
      { okey: 'cc-scs', parentKey: '', type: 'leaf' as const, accountingTenantId: 'scs' },
    ];
    const lines = [mk('cc-jun'), mk('cc-old'), mk('cc-grp'), mk('cc-scs'), mk('')];
    expect(copyBooking(booking, lines, '20250916', centers).lines.map(l => l.costCenterKey)).toEqual(['cc-jun', '', '', '', '']);
    // without the list the keys are copied as they are (the server still validates them)
    expect(copyBooking(booking, lines, '20250916').lines.map(l => l.costCenterKey)).toEqual(['cc-jun', 'cc-old', 'cc-grp', 'cc-scs', '']);
  });
});

describe('split bookings', () => {
  const ids = new Map([['k1020', '1020'], ['k3401', '3401'], ['k3407', '3407']]);
  const names = new Map([['k1020', 'Bank'], ['k3401', 'Mitgliederbeiträge'], ['k3407', 'Spenden']]);
  const line = (okey: string, accountKey: string, side: 'debit' | 'credit', amount: number, description = ''): BookingLineModel => {
    const l = new BookingLineModel('t1', 'org1');
    l.okey = okey; l.accountKey = accountKey; l.description = description;
    if (side === 'debit') l.debitAmount = { amount, currency: 'CHF', periodicity: 'one-time' };
    else l.creditAmount = { amount, currency: 'CHF', periodicity: 'one-time' };
    return l;
  };
  // one bank payment: Mitgliederbeitrag + Spende
  const lines = [line('l0', 'k1020', 'debit', 15000), line('l1', 'k3401', 'credit', 5000, 'Beitrag 2026'), line('l2', 'k3407', 'credit', 10000)];
  const booking = makeBooking({ title: 'Sammelbuchung · Anna Muster' });

  it('splitBookingTitle / isSplitBookingTitle', () => {
    expect(splitBookingTitle('Sammelbuchung', ' Migros ')).toBe('Sammelbuchung · Migros');
    expect(splitBookingTitle('Sammelbuchung')).toBe('Sammelbuchung');
    expect(isSplitBookingTitle('Sammelbuchung · Migros', 'Sammelbuchung')).toBe(true);
    expect(isSplitBookingTitle('Sammelbuchung', 'Sammelbuchung')).toBe(true);
    expect(isSplitBookingTitle('Sammelbuchungen 2025', 'Sammelbuchung')).toBe(false);
  });

  it('toJournalRow lists a split booking as Soll/Haben parts without the bank line, none for a plain booking', () => {
    const row = toJournalRow(booking, lines, ids, names);
    expect(row.parts.map(p => [p.debitAccountId, p.creditAccountId, p.creditAccountName, p.text, p.amount])).toEqual([
      ['1020', '3401', 'Mitgliederbeiträge', 'Beitrag 2026', '50.00'], ['1020', '3407', 'Spenden', '', '100.00'],
    ]);
    expect(toJournalRow(booking, lines.slice(0, 2), ids).parts).toEqual([]);
  });

  it('toAccountJournalRows shows only the lines on the account, with their own amount and text', () => {
    const [donation] = toAccountJournalRows(booking, lines, 'k3407', ids, names);
    expect(donation).toMatchObject({ okey: 'b1#l2', lineKey: 'l2', debitAccount: '1020', creditAccount: '3407', creditAccountName: 'Spenden', accountName: 'Sammelbuchung · Anna Muster', amount: '100.00', parts: [] });
    expect(toAccountJournalRows(booking, lines, 'k3401', ids)[0]).toMatchObject({ accountName: 'Beitrag 2026', amount: '50.00' });
    expect(toAccountJournalRows(booking, lines, 'k1020', ids)).toMatchObject([{ debitAccount: '1020', creditAccount: '3401, 3407', amount: '150.00' }]);
    expect(toAccountJournalRows(booking, lines, 'kOther', ids)).toEqual([]);
  });

  it('sideAccountKeys lists the distinct accounts of one side in line order', () => {
    expect(sideAccountKeys(lines, 'credit')).toEqual(['k3401', 'k3407']);
    expect(sideAccountKeys(lines, 'debit')).toEqual(['k1020']);
    expect(sideAccountKeys([...lines, line('l3', 'k3401', 'credit', 1)], 'credit')).toEqual(['k3401', 'k3407']);
  });

  it('toAccountJournalRows keeps a plain booking as one whole row', () => {
    expect(toAccountJournalRows(booking, lines.slice(0, 2), 'k1020', ids)).toMatchObject([{ okey: 'b1', lineKey: '' }]);
  });

  const pair = (debit: string, credit: string, amount: number, description = '') => ({ ...emptyBookingPair(), debitAccountKey: debit, creditAccountKey: credit, amount, description });
  const migros = { key: '', name1: '', name2: 'Migros', modelType: 'org', type: '', subType: '', label: 'Migros' } as AvatarInfo;
  const data = (title: string, pairs: ReturnType<typeof pair>[], counterparty: AvatarInfo | undefined = migros): BookingFormData => ({ okey: '', title, date: '20260315', notes: '', counterparty, pairs });

  it('addBookingPart moves the title onto the first part and names the booking after the counterparty', () => {
    const split = addBookingPart(data('Migros Einkauf', [pair('k6500', 'k1020', 5000)]), 'Sammelbuchung');
    expect(split.title).toBe('Sammelbuchung · Migros');
    expect(split.pairs.map(p => p.description)).toEqual(['Migros Einkauf', '']);
    // a part that already has its own text keeps it; a third row changes nothing else
    expect(addBookingPart(data('X', [pair('a', 'b', 1, 'eigen')], undefined), 'S').pairs.map(p => p.description)).toEqual(['eigen', '']);
    const third = addBookingPart(split, 'Sammelbuchung');
    expect(third.title).toBe('Sammelbuchung · Migros');
    expect(third.pairs.map(p => p.description)).toEqual(['Migros Einkauf', '', '']);
  });

  it('withSplitTitle follows the counterparty and leaves a one-part booking alone', () => {
    const split = addBookingPart(data('Migros Einkauf', [pair('k6500', 'k1020', 5000)]), 'Sammelbuchung');
    expect(withSplitTitle({ ...split, counterparty: undefined }, 'Sammelbuchung').title).toBe('Sammelbuchung');
    const one = data('Einkauf', [pair('a', 'b', 1)]);
    expect(withSplitTitle(one, 'Sammelbuchung')).toBe(one);
    // a legacy split whose title is the text of the booking: the text moves onto the first part
    const legacy = withSplitTitle(data('GS JB und Spende', [pair('k1020', 'k3401', 1), pair('k1020', 'k3407', 2)]), 'Sammelbuchung');
    expect([legacy.title, legacy.pairs[0].description]).toEqual(['Sammelbuchung · Migros', 'GS JB und Spende']);
  });

  it('removeBookingPart restores the title when one part is left', () => {
    const split = addBookingPart(data('Migros Einkauf', [pair('k6500', 'k1020', 5000)]), 'Sammelbuchung');
    const back = removeBookingPart(split, 1, 'Sammelbuchung');
    expect(back.title).toBe('Migros Einkauf');
    expect(back.pairs.map(p => p.description)).toEqual(['']);
    // a title the user changed by hand stays
    expect(removeBookingPart({ ...split, title: 'Einkauf Juni' }, 1, 'Sammelbuchung').title).toBe('Einkauf Juni');
  });

  it('pairsToLines puts part texts on the parts, not on the shared bank line', () => {
    const back = pairsToLines([pair('k1020', 'k3401', 5000, 'Beitrag'), pair('k1020', 'k3407', 10000, 'Spende')], 't1', 'org1', 'b1');
    expect(back.map(l => [l.accountKey, l.debitAmount?.amount ?? l.creditAmount?.amount, l.description])).toEqual([
      ['k1020', 15000, ''], ['k3401', 5000, 'Beitrag'], ['k3407', 10000, 'Spende'],
    ]);
  });
});

describe('Kostenstelle on pairs', () => {
  it('keeps one account split over two Kostenstellen as two lines', () => {
    const pairs: BookingPair[] = [
      { ...emptyBookingPair(), debitAccountKey: 'scs-6300', creditAccountKey: 'scs-1020', amount: 70000, debitCostCenterKey: 'cc-jun' },
      { ...emptyBookingPair(), debitAccountKey: 'scs-6300', creditAccountKey: 'scs-1020', amount: 50000, debitCostCenterKey: 'cc-reg' },
    ];
    const lines = pairsToLines(pairs, 'scs', 'scs', 'b1');
    expect(lines.filter(l => l.debitAmount).map(l => [l.costCenterKey, l.debitAmount?.amount])).toEqual([['cc-jun', 70000], ['cc-reg', 50000]]);
    expect(lines.filter(l => l.creditAmount)).toHaveLength(1);
    const back = linesToPairs(lines);
    expect(back.map(p => [p.debitCostCenterKey, p.amount])).toEqual([['cc-jun', 70000], ['cc-reg', 50000]]);
  });
  it('reads legacy lines without the field as empty', () => {
    const lines = pairsToLines([{ ...emptyBookingPair(), debitAccountKey: 'scs-6300', creditAccountKey: 'scs-1020', amount: 100 }], 'scs', 'scs', 'b1');
    delete (lines[0] as Partial<BookingLineModel>).costCenterKey;
    expect(linesToPairs(lines)[0].debitCostCenterKey).toBe('');
  });
  it('withPairAccount prefills the account default and clears it on a balance-sheet account', () => {
    const accounts = [
      Object.assign(new AccountModel('scs'), { okey: 'scs-6300', id: '6300', costCenterKey: 'cc-reg' }),
      Object.assign(new AccountModel('scs'), { okey: 'scs-1020', id: '1020' }),
    ];
    const p1 = withPairAccount(emptyBookingPair(), 'debit', 'scs-6300', accounts);
    expect([p1.debitAccountKey, p1.debitCostCenterKey]).toEqual(['scs-6300', 'cc-reg']);
    const p2 = withPairAccount({ ...p1 }, 'debit', 'scs-1020', accounts);
    expect([p2.debitAccountKey, p2.debitCostCenterKey]).toEqual(['scs-1020', '']);
  });
  it('withPairAccount keeps a chosen key when the new account has no default', () => {
    const accounts = [Object.assign(new AccountModel('scs'), { okey: 'scs-6500', id: '6500' })];
    const p = withPairAccount({ ...emptyBookingPair(), debitCostCenterKey: 'cc-jun' }, 'debit', 'scs-6500', accounts);
    expect(p.debitCostCenterKey).toBe('cc-jun');
  });
  it('withPairAccount leaves the pair unchanged when the same account is re-picked', () => {
    const accounts = [Object.assign(new AccountModel('scs'), { okey: 'scs-6300', id: '6300', costCenterKey: 'cc-reg' })];
    const pair = { ...emptyBookingPair(), debitAccountKey: 'scs-6300', debitCostCenterKey: 'cc-jun' };
    expect(withPairAccount(pair, 'debit', 'scs-6300', accounts)).toBe(pair);
  });
  it('withPairAccount clears the key for an unknown account', () => {
    const p = withPairAccount({ ...emptyBookingPair(), debitCostCenterKey: 'cc-jun' }, 'debit', 'nope', []);
    expect(p.debitCostCenterKey).toBe('');
  });
});

describe('bookingWriteErrorReason', () => {
  it('reads the reason a ledger callable attaches to its HttpsError', () => {
    expect(bookingWriteErrorReason({ details: { reason: 'period-locked' } })).toBe('period-locked');
    expect(bookingWriteErrorReason({ details: { reason: 'cost-center-invalid', costCenterKey: 'k' } })).toBe('cost-center-invalid');
  });
  it('is undefined for an unknown reason, no details or a non-object', () => {
    expect(bookingWriteErrorReason({ details: { reason: 'other' } })).toBeUndefined();
    expect(bookingWriteErrorReason(new Error('x'))).toBeUndefined();
    expect(bookingWriteErrorReason(undefined)).toBeUndefined();
    expect(bookingWriteErrorReason('boom')).toBeUndefined();
  });
});

describe('accountDefaultCostCenterKey', () => {
  const acc = (okey: string, id: string, costCenterKey = ''): AccountModel =>
    ({ okey, id, costCenterKey, accountingTenantId: 'gss' }) as AccountModel;
  const accounts = [acc('a6300', '6300', 'cc-jun'), acc('a6400', '6400', 'cc-old'), acc('a6500', '6500'), acc('a1020', '1020', 'cc-jun')];
  const centers = [
    { okey: 'cc-jun', parentKey: '', type: 'leaf', accountingTenantId: 'gss' },
    { okey: 'cc-old', parentKey: '', type: 'leaf', isArchived: true, accountingTenantId: 'gss' },
  ];
  it('is the default writeBooking fills for an empty line', () =>
    expect(accountDefaultCostCenterKey('a6300', accounts, centers)).toBe('cc-jun'));
  it('is empty when the default is not an active leaf, the account has none, is a balance-sheet account or unknown', () => {
    expect(accountDefaultCostCenterKey('a6400', accounts, centers)).toBe('');
    expect(accountDefaultCostCenterKey('a6500', accounts, centers)).toBe('');
    expect(accountDefaultCostCenterKey('a1020', accounts, centers)).toBe('');
    expect(accountDefaultCostCenterKey('nope', accounts, centers)).toBe('');
  });
});
