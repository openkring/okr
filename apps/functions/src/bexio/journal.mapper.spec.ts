import { describe, expect, it } from 'vitest';
import { journalBookingDoc, journalLineAmounts } from './journal.mapper';

describe('journalBookingDoc', () => {
  it('never writes the fields the migration owns (periodKey, documentKey, documentKeys)', () => {
    const d = journalBookingDoc({ id: 59, description: 'Miete', date: '2026-01-05T00:00:00+01:00' }, '20260105', 'scs');
    expect(d).not.toHaveProperty('periodKey');
    expect(d).not.toHaveProperty('documentKey');
    expect(d).not.toHaveProperty('documentKeys');
    expect(d).toMatchObject({ title: 'Miete', date: '20260105', bookingNo: 59, status: 'posted', accountingTenantId: 'scs' });
  });
});

describe('journalLineAmounts', () => {
  const codes = new Map([[1, 'CHF'], [2, 'EUR']]);

  it('books a CHF row as is, without a foreign amount', () => {
    expect(journalLineAmounts({ amount: 588.57, currency_id: 1, base_currency_id: 1, base_currency_amount: 588.57 }, codes))
      .toEqual({ chf: { amount: 58857, currency: 'CHF', periodicity: 'one-time' }, fx: null });
  });

  it('books a EUR row with its CHF amount and keeps the EUR amount (bexio 9978)', () => {
    expect(journalLineAmounts({ amount: 168.15, currency_id: 2, base_currency_id: 1, base_currency_amount: 159 }, codes))
      .toEqual({ chf: { amount: 15900, currency: 'CHF', periodicity: 'one-time' }, fx: { amount: 16815, currency: 'EUR', periodicity: 'one-time' } });
  });

  it('falls back to amount when bexio sends no base amount', () => {
    expect(journalLineAmounts({ amount: '12.30' }, codes).chf.amount).toBe(1230);
  });
});
