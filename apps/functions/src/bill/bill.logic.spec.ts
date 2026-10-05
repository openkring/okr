import { describe, expect, it } from 'vitest';

import { billBookingLines, billTotal, bookBlockers, cleanBillLines, draftWriteRefusal, MAX_BILL_LINES } from './bill.logic';

const line = (o: Record<string, unknown> = {}) => ({ title: 'Internet', accountKey: 'scs0238', amount: 3900, vatCodeKey: '', costCenterKey: '', ...o });

describe('bill logic', () => {
  describe('cleanBillLines', () => {
    it('keeps the five fields, trims and caps the title', () => {
      expect(cleanBillLines([{ ...line({ title: '  DSL  ' }), extra: 'x' }])).toEqual([line({ title: 'DSL' })]);
      expect(cleanBillLines([line({ title: 'x'.repeat(300) })])[0].title).toHaveLength(200);
    });
    it('fills missing strings with empty ones (a draft may be incomplete)', () =>
      expect(cleanBillLines([{ amount: 0 }])).toEqual([{ title: '', accountKey: '', amount: 0, vatCodeKey: '', costCenterKey: '' }]));
    it('refuses a non-array, too many lines, fractional or negative amounts', () => {
      expect(() => cleanBillLines('x')).toThrow();
      expect(() => cleanBillLines(Array.from({ length: MAX_BILL_LINES + 1 }, () => line()))).toThrow();
      expect(() => cleanBillLines([line({ amount: 10.5 })])).toThrow();
      expect(() => cleanBillLines([line({ amount: -1 })])).toThrow();
      expect(() => cleanBillLines([null])).toThrow();
    });
    it('undefined is an empty list', () => expect(cleanBillLines(undefined)).toEqual([]));
  });

  it('total = Σ line amounts', () => expect(billTotal([line(), line({ amount: 100 })])).toBe(4000));

  it('booking lines: one debit per bill line, one credit on payables for the total', () => {
    expect(billBookingLines([line(), line({ title: 'Router', accountKey: 'scs0240', amount: 100, vatCodeKey: 'vst', costCenterKey: 'cc1' })], 'scs0121')).toEqual([
      { accountKey: 'scs0238', debitAmount: { amount: 3900, currency: 'CHF' }, description: 'Internet' },
      { accountKey: 'scs0240', debitAmount: { amount: 100, currency: 'CHF' }, description: 'Router', vatCodeKey: 'vst', costCenterKey: 'cc1' },
      { accountKey: 'scs0121', creditAmount: { amount: 4000, currency: 'CHF' } },
    ]);
  });

  describe('bookBlockers', () => {
    const bill = (o: Record<string, unknown> = {}) => ({ state: 'draft', lines: [line()], billDate: '20260901', bookingKeys: [], ...o });
    it('a complete draft can be booked', () => expect(bookBlockers(bill(), 'scs0121')).toEqual([]));
    it('names every problem', () => {
      expect(bookBlockers(bill({ state: 'todo' }), 'scs0121')).toContain('not-draft');
      expect(bookBlockers(bill({ bookingKeys: ['bill-x'] }), 'scs0121')).toContain('already-booked');
      expect(bookBlockers(bill({ lines: [] }), 'scs0121')).toContain('no-lines');
      expect(bookBlockers(bill({ lines: [line({ amount: 0 })] }), 'scs0121')).toContain('zero-amount');
      expect(bookBlockers(bill({ lines: [line({ accountKey: '' })] }), 'scs0121')).toContain('no-account');
      expect(bookBlockers(bill({ billDate: '' }), 'scs0121')).toContain('no-bill-date');
      expect(bookBlockers(bill(), '')).toContain('no-payables-account');
    });
    it('a legacy doc without lines has no lines', () => expect(bookBlockers({ state: 'draft', billDate: '20260901' }, 'scs0121')).toContain('no-lines'));
  });

  it('only a draft without a booking may be written or deleted', () => {
    expect(draftWriteRefusal(undefined, 'create')).toBeUndefined();
    expect(draftWriteRefusal({ state: 'draft', bookingKeys: [] }, 'update')).toBeUndefined();
    expect(draftWriteRefusal(undefined, 'update')).toBe('not-found');
    expect(draftWriteRefusal({ state: 'todo', bookingKeys: [] }, 'update')).toBe('not-a-draft');
    expect(draftWriteRefusal({ state: 'draft', bookingKeys: ['bill-k'] }, 'delete')).toBe('not-a-draft');
    expect(draftWriteRefusal({ state: 'draft' }, 'delete')).toBeUndefined();
  });
});
