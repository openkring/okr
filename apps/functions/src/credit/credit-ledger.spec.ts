/** applyCreditEntry against a small in-memory Firestore with transactions (period lock, numbering, leaf check stubbed). */
import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

vi.mock('../booking/period-lock', () => ({ assertPeriodsOpen: vi.fn(async () => undefined), touchedPeriodKeys: vi.fn(() => []) }));
vi.mock('../booking/booking-no', () => ({ allocateBookingNo: vi.fn(async () => 7) }));
vi.mock('../cost-center/cost-center-context', () => ({ loadCostCenterContext: vi.fn(async () => ({})), costCenterKeyForLine: vi.fn(() => '') }));
vi.mock('../invoice/invoice-context', async importOriginal => ({
  ...(await importOriginal<typeof import('../invoice/invoice-context')>()),
  assertLeafAccount: vi.fn(async () => undefined),
}));

import { applyCreditEntry } from './credit-ledger';

type Doc = Record<string, unknown>;
type Store = Record<string, Doc>; // keyed by full path

function fakeDb(store: Store): Firestore {
  const docRef = (path: string): unknown => ({
    path,
    get: async () => ({ exists: store[path] !== undefined, data: () => (store[path] ? { ...store[path] } : undefined) }),
    collection: (name: string) => colRef(`${path}/${name}`),
  });
  const colRef = (path: string): unknown => ({ path, doc: (id: string) => docRef(`${path}/${id}`) });
  const pathOf = (r: unknown) => (r as { path: string }).path;
  return {
    collection: (name: string) => colRef(name),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn({
      get: async (r: unknown) => (r as { get(): Promise<unknown> }).get(),
      set: (r: unknown, d: Doc) => { store[pathOf(r)] = d; },
      update: (r: unknown, d: Doc) => { store[pathOf(r)] = { ...store[pathOf(r)], ...d }; },
    }),
  } as unknown as Firestore;
}

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
});
