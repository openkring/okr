/** The Postversand credit port against the real 1.149 code (credit-api, ledger) on the in-memory Firestore of the credit specs. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../booking/period-lock', () => ({ assertPeriodsOpen: vi.fn(async () => undefined), touchedPeriodKeys: vi.fn(() => []) }));
vi.mock('../booking/booking-no', () => ({ allocateBookingNo: vi.fn(async () => 7) }));
vi.mock('../cost-center/cost-center-context', () => ({ loadCostCenterContext: vi.fn(async () => ({})), costCenterKeyForLine: vi.fn(() => '') }));
vi.mock('../invoice/invoice-context', async importOriginal => ({
  ...(await importOriginal<typeof import('../invoice/invoice-context')>()),
  assertLeafAccount: vi.fn(async () => undefined),
}));

import { applyCreditEntry } from '../credit/credit-ledger';
import { fakeDb, type Store } from '../credit/testing/credit-fake-db';
import { makeBoundCreditPort } from './credit-binding';

const seed = (): Store => ({
  'platform-config/billing': { operatorTenantId: 'kring', accountingTenantId: 'bka' },
  'accounting-configs/bka': { tenants: ['kring'], fiscalYearStart: 1, prepaymentAccountKey: 'acc-2300', transactionRevenueAccountKey: 'acc-3200' },
});
const setup = async (amount: number) => {
  const store = seed();
  const db = fakeDb(store);
  await applyCreditEntry(db, 'scs', 'top', {
    kind: 'topup', amount, date: '20261109100000', product: '', units: 0, pages: 0, unitPrice: 0, pagePrice: 0, reference: 'inv', reason: '', createdBy: 'system',
  });
  return { store, port: makeBoundCreditPort(() => db) };
};

describe('credit port bound to 1.149', () => {
  it('quote(3, 6) totals 540 Rappen', () => {
    expect(makeBoundCreditPort(() => fakeDb(seed())).quote(3, 6)).toMatchObject({ total: 540, perUnit: 120, perPage: 30 });
  });

  it('reads the balance', async () => {
    const { port } = await setup(2000);
    expect(await port.balance('scs')).toBe(2000);
    expect(await port.balance('other')).toBe(0);
  });

  it('deducts under deduct-<reference>', async () => {
    const { port } = await setup(2000);
    expect(await port.deduct('scs', { letters: 3, pages: 6, reference: 'mailing.m1', actor: 'uid1' })).toEqual({ entryId: 'deduct-mailing.m1', balanceAfter: 1460 });
  });

  it('insufficient credit is HttpsError failed-precondition / "insufficient-credit" (post-order.ts isInsufficientCredit matches exactly this pair)', async () => {
    const { port } = await setup(100);
    const err = await port.deduct('scs', { letters: 1, pages: 1, reference: 'x', actor: 'u' }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'failed-precondition', message: 'insufficient-credit' });
  });

  it('reverseShare is a partial reversal { units: 1, pages } under its key, idempotent per key', async () => {
    const { store, port } = await setup(2000);
    const { entryId } = await port.deduct('scs', { letters: 3, pages: 6, reference: 'm2', actor: 'u' }); // 540
    const first = await port.reverseShare('scs', entryId, { units: 1, pages: 2 }, 'letter-a', 'rejected');
    expect(first).toEqual({ amount: 180, duplicate: false }); // 120 + 2*30
    expect(store[`credit-accounts/scs/entries/reverse-${entryId}-letter-a`]).toMatchObject({ kind: 'reversal', units: 1, pages: 2, amount: 180 });
    const again = await port.reverseShare('scs', entryId, { units: 1, pages: 2 }, 'letter-a', 'rejected');
    expect(again).toEqual({ amount: 180, duplicate: true });
    expect(await port.balance('scs')).toBe(2000 - 540 + 180);
  });
});
