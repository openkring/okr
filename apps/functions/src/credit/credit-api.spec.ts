/** deductCredit / reverseCredit against the versioned in-memory Firestore of the ledger spec. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../booking/period-lock', () => ({ assertPeriodsOpen: vi.fn(async () => undefined), touchedPeriodKeys: vi.fn(() => []) }));
vi.mock('../booking/booking-no', () => ({ allocateBookingNo: vi.fn(async () => 7) }));
vi.mock('../cost-center/cost-center-context', () => ({ loadCostCenterContext: vi.fn(async () => ({})), costCenterKeyForLine: vi.fn(() => '') }));
vi.mock('../invoice/invoice-context', async importOriginal => ({
  ...(await importOriginal<typeof import('../invoice/invoice-context')>()),
  assertLeafAccount: vi.fn(async () => undefined),
}));

import { applyCreditEntry } from './credit-ledger';
import { deductCredit, reverseCredit } from './credit-api';
import { fakeDb, type Doc, type Store } from './testing/credit-fake-db';
import { toStoreDateTime } from '../srv/zurich-time';

const seed = (extra: Store = {}): Store => ({
  'platform-config/billing': { operatorTenantId: 'kring', accountingTenantId: 'bka' },
  'accounting-configs/bka': { tenants: ['kring'], fiscalYearStart: 1, prepaymentAccountKey: 'acc-2300', transactionRevenueAccountKey: 'acc-3200' },
  ...extra,
});
const topUp = (db: ReturnType<typeof fakeDb>, amount: number) => applyCreditEntry(db, 'scs', 'top', {
  kind: 'topup', amount, date: '20261109100000', product: '', units: 0, pages: 0, unitPrice: 0, pagePrice: 0, reference: 'inv', reason: '', createdBy: 'system',
});
const REQUEST = 'credit-accounts/scs/auto-top-up/request';
const autoOn = { 'subscriptions/scs': { autopay: true, autoTopUp: { enabled: true, threshold: 1000, amount: 10000 } } };
const letters = (units: number, pages: number, reference: string) => ({ product: 'pingen-letter' as const, units, pages, reference, actor: 'uid1' });

describe('deductCredit', () => {
  it('deducts the quote under deduct-<reference> and keeps the prices on the entry', async () => {
    const store = seed();
    const db = fakeDb(store);
    await topUp(db, 2000);
    const r = await deductCredit(db, 'scs', letters(3, 5, 'mailing.m1'));
    expect(r).toEqual({ entryId: 'deduct-mailing.m1', balanceAfter: 1490 });
    expect(store['credit-accounts/scs/entries/deduct-mailing.m1']).toMatchObject({
      kind: 'deduction', amount: -510, units: 3, pages: 5, unitPrice: 120, pagePrice: 30, reference: 'mailing.m1', createdBy: 'uid1',
    });
  });

  it('refuses a slash or an empty reference / tenant instead of rewriting it, nothing written', async () => {
    const store = seed();
    const db = fakeDb(store);
    await topUp(db, 2000);
    for (const [tenant, reference] of [['scs', 'a/b'], ['scs', ''], ['scs', '  '], ['s/cs', 'a'], ['', 'a']]) {
      await expect(deductCredit(db, tenant, letters(1, 1, reference))).rejects.toMatchObject({ code: 'invalid-argument' });
    }
    expect(Object.keys(store).filter(k => k.includes('/entries/deduct-'))).toEqual([]);
  });

  it('refuses bad counts and products with invalid-argument, no coercion', async () => {
    const db = fakeDb(seed());
    await expect(deductCredit(db, 'scs', letters(0, 1, 'x'))).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(deductCredit(db, 'scs', letters(1.5, 2, 'x'))).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(deductCredit(db, 'scs', { ...letters(1, 1, 'x'), units: '1' as never })).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(deductCredit(db, 'scs', { ...letters(1, 1, 'x'), product: 'fax' as never })).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  // The brief's "150 with two parallel letters of 120" predates per-page pricing: a letter now has at least one
  // page, so the smallest deduction is 150. Same race, one letter more of headroom: 270 − 150 = 120 < 150.
  it('270 with two parallel one-page letters (150 each): one passes, one insufficient-credit, balance 120', async () => {
    const store = seed();
    const db = fakeDb(store);
    await topUp(db, 270);
    const results = await Promise.allSettled([deductCredit(db, 'scs', letters(1, 1, 'a')), deductCredit(db, 'scs', letters(1, 1, 'b'))]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'failed-precondition', message: 'insufficient-credit' });
    expect(store['credit-accounts/scs']['balance']).toBe(120);
    expect(Object.keys(store).filter(k => /entries\/deduct-[ab]$/.test(k))).toHaveLength(1);
  });

  it('requests an auto top-up when the balance falls below the threshold, once', async () => {
    const store = seed({
      'subscriptions/scs': { autopay: true, autoTopUp: { enabled: true, threshold: 1000, amount: 10000 } },
    });
    const db = fakeDb(store);
    await topUp(db, 1500);
    await deductCredit(db, 'scs', letters(1, 1, 'a')); // 1350: above
    expect(store[REQUEST]).toBeUndefined();
    await deductCredit(db, 'scs', letters(3, 3, 'b')); // 900: below
    const requested = String(store[REQUEST]['requestedAt']);
    expect(requested).toMatch(/^\d{14}$/);
    expect(store[REQUEST]['pendingInvoiceKey']).toBe('');
    expect(store['credit-accounts/scs']).not.toHaveProperty('autoTopUpRequestedAt');
    await deductCredit(db, 'scs', letters(1, 1, 'c')); // still pending: not requested again
    expect(store[REQUEST]['requestedAt']).toBe(requested);
  });

  it('a fresh pending top-up blocks a new request', async () => {
    const store = seed({ ...autoOn, [REQUEST]: { requestedAt: toStoreDateTime(new Date(Date.now() - 60 * 60 * 1000)), pendingInvoiceKey: 'topup-scs-old' } });
    const db = fakeDb(store);
    await topUp(db, 1000);
    const before = { ...store[REQUEST] };
    await deductCredit(db, 'scs', letters(1, 1, 'a'));
    expect(store[REQUEST]).toEqual(before);
  });

  it('a pending top-up older than 24 h is requested again, keeping its invoice key', async () => {
    const old = toStoreDateTime(new Date(Date.now() - 25 * 60 * 60 * 1000));
    const store = seed({ ...autoOn, [REQUEST]: { requestedAt: old, pendingInvoiceKey: 'topup-scs-old' } });
    const db = fakeDb(store);
    await topUp(db, 1000);
    await deductCredit(db, 'scs', letters(1, 1, 'a'));
    expect(store[REQUEST]['requestedAt']).not.toBe(old);
    expect(store[REQUEST]['pendingInvoiceKey']).toBe('topup-scs-old');
  });

  it('no auto top-up without autopay', async () => {
    const store = seed({ 'subscriptions/scs': { autopay: false, autoTopUp: { enabled: true, threshold: 1000, amount: 10000 } } });
    const db = fakeDb(store);
    await topUp(db, 1000);
    await deductCredit(db, 'scs', letters(1, 1, 'a'));
    expect(store[REQUEST]).toBeUndefined();
  });
});

describe('reverseCredit', () => {
  const deducted = async () => {
    const store: Store = seed();
    const db = fakeDb(store);
    await topUp(db, 2000);
    const { entryId } = await deductCredit(db, 'scs', letters(3, 5, 'mailing.m1')); // 3×120 + 5×30 = 510
    return { store, db, entryId };
  };
  const entry = (store: Store, id: string): Doc => store[`credit-accounts/scs/entries/${id}`];

  it('partial reversals add up to the entry, then refuse', async () => {
    const { store, db, entryId } = await deducted();
    const a = await reverseCredit(db, 'scs', entryId, 'rejected by Pingen', { units: 1, pages: 2 }, 'a');
    expect(a).toEqual({ amount: 180, balanceAfter: 1670, duplicate: false });
    expect(entry(store, `reverse-${entryId}-a`)).toMatchObject({ kind: 'reversal', amount: 180, reference: entryId, unitPrice: 120, pagePrice: 30 });
    expect(entry(store, entryId)['reversedAmount']).toBe(180);

    const again = await reverseCredit(db, 'scs', entryId, 'rejected by Pingen', { units: 1, pages: 2 }, 'a');
    expect(again).toMatchObject({ duplicate: true, balanceAfter: 1670 });
    expect(store['credit-accounts/scs']['balance']).toBe(1670);
    expect(entry(store, entryId)['reversedAmount']).toBe(180);

    const b = await reverseCredit(db, 'scs', entryId, 'rejected', { units: 2, pages: 3 }, 'b');
    expect(b).toEqual({ amount: 330, balanceAfter: 2000, duplicate: false });
    expect(entry(store, entryId)['reversedAmount']).toBe(510);

    await expect(reverseCredit(db, 'scs', entryId, 'rejected', { units: 0, pages: 1 }, 'c'))
      .rejects.toMatchObject({ code: 'failed-precondition', message: 'reversal-exceeds-entry' });
    expect(entry(store, `reverse-${entryId}-c`)).toBeUndefined();
    expect(store['credit-accounts/scs']['balance']).toBe(2000);
  });

  it('parallel reversals never exceed the entry', async () => {
    const { store, db, entryId } = await deducted();
    const results = await Promise.allSettled([
      reverseCredit(db, 'scs', entryId, 'r', { units: 2, pages: 3 }, 'x'),
      reverseCredit(db, 'scs', entryId, 'r', { units: 2, pages: 3 }, 'y'),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(entry(store, entryId)['reversedAmount']).toBe(330);
    expect(store['credit-accounts/scs']['balance']).toBe(1820);
  });

  it('refuses an unknown entry, a non-deduction and an empty part', async () => {
    const { db, entryId } = await deducted();
    await expect(reverseCredit(db, 'scs', 'nope', 'r', { units: 1, pages: 1 }, 'k')).rejects.toMatchObject({ code: 'not-found' });
    await expect(reverseCredit(db, 'scs', 'top', 'r', { units: 1, pages: 1 }, 'k')).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(reverseCredit(db, 'scs', entryId, 'r', { units: 0, pages: 0 }, 'k')).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(reverseCredit(db, 'scs', entryId, 'r', { units: 1, pages: 1 }, '')).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(reverseCredit(db, 'scs', entryId, 'r', { units: 1, pages: 1 }, 'a/b')).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(reverseCredit(db, 'scs', 'deduct-a/b', 'r', { units: 1, pages: 1 }, 'k')).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(reverseCredit(db, 's/cs', entryId, 'r', { units: 1, pages: 1 }, 'k')).rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(reverseCredit(db, 'scs', entryId, 'r', { units: 1.5, pages: 1 }, 'k')).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
