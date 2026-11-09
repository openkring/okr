/** applyCreditEntry against a small in-memory Firestore with transactions (period lock, numbering, leaf check stubbed). */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../booking/period-lock', () => ({ assertPeriodsOpen: vi.fn(async () => undefined), touchedPeriodKeys: vi.fn(() => []) }));
vi.mock('../booking/booking-no', () => ({ allocateBookingNo: vi.fn(async () => 7) }));
vi.mock('../cost-center/cost-center-context', () => ({ loadCostCenterContext: vi.fn(async () => ({})), costCenterKeyForLine: vi.fn(() => '') }));
vi.mock('../invoice/invoice-context', async importOriginal => ({
  ...(await importOriginal<typeof import('../invoice/invoice-context')>()),
  assertLeafAccount: vi.fn(async () => undefined),
}));

import { applyCreditEntry } from './credit-ledger';
import { fakeDb, type Doc, type Store } from './testing/credit-fake-db';

const seed = (config: Doc = {}): Store => ({
  'platform-config/billing': { operatorTenantId: 'kring', accountingTenantId: 'bka' },
  'accounting-configs/bka': { tenants: ['kring'], fiscalYearStart: 1, prepaymentAccountKey: 'acc-2300', transactionRevenueAccountKey: 'acc-3200', ...config },
});
const entry = (o: Partial<Parameters<typeof applyCreditEntry>[3]> = {}) => ({
  kind: 'topup' as const, amount: 2000, date: '20261109100000', product: '', units: 0, pages: 0, unitPrice: 0, pagePrice: 0,
  reference: 'inv1', reason: '', createdBy: 'system', ...o,
});

describe('applyCreditEntry', () => {
  it('creates the account at 0 and tops up without a booking', async () => {
    const store = seed();
    const r = await applyCreditEntry(fakeDb(store), 'scs', 'e1', entry());
    expect(r).toEqual({ balanceAfter: 2000, duplicate: false });
    expect(store['credit-accounts/scs']).toMatchObject({ balance: 2000, tenants: ['scs'] });
    expect(store['credit-accounts/scs/entries/e1']).toMatchObject({ balanceAfter: 2000, bookingKey: '' });
    expect(Object.keys(store).filter(k => k.startsWith('bookings'))).toEqual([]);
  });

  it('same entryId twice: duplicate, one entry, balance changed once', async () => {
    const store = seed();
    const db = fakeDb(store);
    await applyCreditEntry(db, 'scs', 'e1', entry());
    const again = await applyCreditEntry(db, 'scs', 'e1', entry());
    expect(again).toEqual({ balanceAfter: 2000, duplicate: true });
    expect(store['credit-accounts/scs']['balance']).toBe(2000);
  });

  it('deduction books prepayment debit / revenue credit', async () => {
    const store = seed();
    const db = fakeDb(store);
    await applyCreditEntry(db, 'scs', 'e1', entry());
    const r = await applyCreditEntry(db, 'scs', 'e2', entry({ kind: 'deduction', amount: -120, reason: 'brief' }));
    expect(r.balanceAfter).toBe(1880);
    expect(store['credit-accounts/scs/entries/e2']).toMatchObject({ bookingKey: 'credit-scs-e2' });
    expect(store['bookings/credit-scs-e2']).toMatchObject({ accountingTenantId: 'bka', bookingNo: 7, date: '20261109' });
    expect(store['booking-lines/credit-scs-e2-0']).toMatchObject({ accountKey: 'acc-2300', debitAmount: { amount: 120 } });
    expect(store['booking-lines/credit-scs-e2-1']).toMatchObject({ accountKey: 'acc-3200', creditAmount: { amount: 120 } });
  });

  it('insufficient credit: refused, nothing written', async () => {
    const store = seed();
    await expect(applyCreditEntry(fakeDb(store), 'scs', 'e1', entry({ kind: 'deduction', amount: -1 }))).rejects.toMatchObject({ code: 'failed-precondition', message: 'insufficient-credit' });
    expect(store['credit-accounts/scs']).toBeUndefined();
    expect(store['credit-accounts/scs/entries/e1']).toBeUndefined();
  });

  it('missing account keys: refused, nothing written', async () => {
    const store = seed({ prepaymentAccountKey: '' });
    await expect(applyCreditEntry(fakeDb(store), 'scs', 'e1', entry({ kind: 'deduction', amount: -1 }))).rejects.toMatchObject({ details: { reason: 'credit-accounts-missing' } });
    expect(store['credit-accounts/scs']).toBeUndefined();
  });

  it('rejects a sign that does not match the kind, nothing written', async () => {
    const store = seed();
    const db = fakeDb(store);
    for (const bad of [{ kind: 'deduction' as const, amount: 5 }, { kind: 'reversal' as const, amount: -5 }, { kind: 'topup' as const, amount: -5 }, { kind: 'correction' as const, amount: 0 }]) {
      await expect(applyCreditEntry(db, 'scs', 'e1', entry(bad))).rejects.toMatchObject({ code: 'invalid-argument', message: 'credit-sign-mismatch' });
    }
    expect(Object.keys(store)).toEqual(['platform-config/billing', 'accounting-configs/bka']);
  });

  it('a duplicate answers duplicate:true even when the books config is gone', async () => {
    const store = seed();
    const db = fakeDb(store);
    await applyCreditEntry(db, 'scs', 'e1', entry());
    store['accounting-configs/bka'] = { tenants: ['kring'] };
    await expect(applyCreditEntry(db, 'scs', 'e1', entry())).resolves.toEqual({ balanceAfter: 2000, duplicate: true });
  });

  it('error texts do not call the entry an invoice', async () => {
    const store = seed();
    delete store['accounting-configs/bka'];
    const err = await applyCreditEntry(fakeDb(store), 'scs', 'e9', entry({ kind: 'deduction', amount: -1 })).catch(e => e as Error);
    expect((err as Error).message).toMatch(/credit e9|accounting config/);
    expect((err as Error).message).not.toMatch(/invoice/);
  });

  describe('concurrency', () => {
    const run = async (start: number, each: number) => {
      const store = seed();
      const db = fakeDb(store);
      await applyCreditEntry(db, 'scs', 'top', entry({ amount: start }));
      const results = await Promise.allSettled([
        applyCreditEntry(db, 'scs', 'a', entry({ kind: 'deduction', amount: -each })),
        applyCreditEntry(db, 'scs', 'b', entry({ kind: 'deduction', amount: -each })),
      ]);
      return { store, results };
    };

    it('2000 with two parallel -1500: one succeeds, balance 500, one booking', async () => {
      const { store, results } = await run(2000, 1500);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
      expect(rejected.reason).toMatchObject({ code: 'failed-precondition', message: 'insufficient-credit' });
      expect(store['credit-accounts/scs']['balance']).toBe(500);
      expect(Object.keys(store).filter(k => /^credit-accounts\/scs\/entries\/[ab]$/.test(k))).toHaveLength(1);
      expect(Object.keys(store).filter(k => k.startsWith('bookings/'))).toHaveLength(1);
    });

    it('150 with two parallel -120: one passes, balance 30', async () => {
      const { store, results } = await run(150, 120);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(store['credit-accounts/scs']['balance']).toBe(30);
    });
  });
});
