import { describe, expect, it } from 'vitest';
import { buildInvoicePayload, invoiceBookingLines, issueBlockers, PositionInput, sortPositions, totalRappen } from './invoice.logic';

const fix = (amount: number, accountKey = 'scs3401', name = 'Beitrag'): PositionInput => ({ type: 'fix', name, amount, accountKey });
const text = (name = 'Hinweis'): PositionInput => ({ type: 'text', name, amount: 0, accountKey: '' });
const subtotal = (): PositionInput => ({ type: 'subtotal', name: 'Zwischentotal', amount: 0, accountKey: '' });
const pageBreak = (): PositionInput => ({ type: 'pageBreak', name: '', amount: 0, accountKey: '' });
const rebate = (amount: number, accountKey = ''): PositionInput => ({ type: 'rebate', name: 'Rabatt', amount, accountKey });

describe('totalRappen with kinds (spec 1.84)', () => {
  it('ignores layout lines and subtracts discounts', () => {
    expect(totalRappen([fix(100), text(), rebate(-10), subtotal(), pageBreak()])).toBe(9000);
  });
});

describe('issueBlockers with kinds', () => {
  it('refuses an invoice with layout lines only', () => {
    expect(issueBlockers([text(), subtotal()], 'scs0093')).toContain('no-positions');
  });
  it('accepts layout lines without amount or account next to a money position', () => {
    expect(issueBlockers([fix(100), text(), subtotal(), pageBreak()], 'scs0093')).toEqual([]);
  });
  it('accepts a discount without account when there is revenue above it', () => {
    expect(issueBlockers([fix(100), rebate(-10)], 'scs0093')).toEqual([]);
  });
  it('refuses a discount without account and nothing above it to reduce', () => {
    expect(issueBlockers([rebate(-10), fix(100)], 'scs0093')).toContain('discount-without-base');
  });
  it('refuses a zero discount like any zero amount', () => {
    expect(issueBlockers([fix(100), rebate(0, 'scs3800')], 'scs0093')).toContain('invalid-amount');
  });
});

describe('invoiceBookingLines with kinds', () => {
  it('books a discount with an account as a debit on that account', () => {
    expect(invoiceBookingLines([fix(100), rebate(-10, 'scs3800')], 'scs0093')).toEqual([
      { accountKey: 'scs0093', debitAmount: { amount: 9000, currency: 'CHF' } },
      { accountKey: 'scs3401', creditAmount: { amount: 10000, currency: 'CHF' } },
      { accountKey: 'scs3800', debitAmount: { amount: 1000, currency: 'CHF' } },
    ]);
  });

  it('spreads a discount without account over the revenue above it — only net amounts are booked', () => {
    expect(invoiceBookingLines([fix(300, 'a'), fix(100, 'b'), rebate(-40)], 'scs0093')).toEqual([
      { accountKey: 'scs0093', debitAmount: { amount: 36000, currency: 'CHF' } },
      { accountKey: 'a', creditAmount: { amount: 27000, currency: 'CHF' } },
      { accountKey: 'b', creditAmount: { amount: 9000, currency: 'CHF' } },
    ]);
  });

  it('spreads with the largest remainder so the lines still balance', () => {
    const lines = invoiceBookingLines([fix(1, 'a'), fix(1, 'b'), fix(1, 'c'), rebate(-0.1)], 'scs0093');
    const credits = lines.slice(1).map((l) => l.creditAmount?.amount ?? 0);
    expect(credits.reduce((s, c) => s + c, 0)).toBe(290);
    expect(lines[0].debitAmount?.amount).toBe(290);
  });

  it('a discount below a subtotal only reduces what stands above it', () => {
    const lines = invoiceBookingLines([fix(100, 'a'), rebate(-10), subtotal(), fix(50, 'b')], 'scs0093');
    expect(lines).toContainEqual({ accountKey: 'a', creditAmount: { amount: 9000, currency: 'CHF' } });
    expect(lines).toContainEqual({ accountKey: 'b', creditAmount: { amount: 5000, currency: 'CHF' } });
  });

  it('books nothing for layout lines', () => {
    expect(invoiceBookingLines([fix(100), text(), subtotal(), pageBreak()], 'scs0093')).toHaveLength(2);
  });
});

describe('sortPositions', () => {
  it('orders by sortOrder and keeps the read order for ties and legacy rows', () => {
    const list = sortPositions([
      { ...fix(1), name: 'c' },
      { ...fix(1), name: 'b', sortOrder: 1 },
      { ...fix(1), name: 'a', sortOrder: 0 },
    ]);
    expect(list.map((p) => p.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('buildInvoicePayload with kinds', () => {
  it('passes each line with its kind and a computed subtotal', () => {
    const payload = buildInvoicePayload({
      invoiceId: '2026-0001', title: 'Rechnung', invoiceDate: '20261004', dueDate: '20261104',
      receiver: { name1: 'Eva', name2: 'Muster', modelType: 'person' },
      positions: [fix(100), rebate(-10), subtotal(), text(), pageBreak(), fix(50)],
    });
    expect(payload['amount']).toBe('140.00');
    expect(payload['positions']).toEqual([
      { kind: 'position', name: 'Beitrag', amount: '100.00' },
      { kind: 'rebate', isRebate: true, name: 'Rabatt', amount: '-10.00' },
      { kind: 'subtotal', isSubtotal: true, name: 'Zwischentotal', amount: '90.00' },
      { kind: 'text', isText: true, name: 'Hinweis' },
      { kind: 'pageBreak', isPageBreak: true, name: '' },
      { kind: 'position', name: 'Beitrag', amount: '50.00' },
    ]);
  });
});
