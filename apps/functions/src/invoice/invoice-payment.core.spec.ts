/**
 * postInvoicePayment (plan 1.149 Task 5): the server-side core of recording a payment, shared by the
 * recordInvoicePayment callable and the Stripe webhook handler. Runs the real transaction body against a
 * small in-memory Firestore; the period lock, booking numbers, Kostenstellen, leaf check and history are stubbed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

vi.mock('../booking/period-lock', () => ({ assertPeriodsOpen: vi.fn(async () => undefined), touchedPeriodKeys: vi.fn(() => []) }));
vi.mock('../booking/booking-no', () => ({ allocateBookingNo: vi.fn(async () => 7) }));
vi.mock('../cost-center/cost-center-context', () => ({ loadCostCenterContext: vi.fn(async () => ({})), costCenterKeyForLine: vi.fn(() => '') }));
vi.mock('../finance-history/finance-history', () => ({ writeFinanceHistory: vi.fn(async () => undefined), chfText: vi.fn(() => ''), historyDetails: vi.fn(() => '') }));
vi.mock('./invoice-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./invoice-context')>()),
  assertLeafAccount: vi.fn(async () => undefined),
}));

import { writeFinanceHistory } from '../finance-history/finance-history';
import { postInvoicePayment } from './invoice-payment.core';

type Doc = Record<string, unknown>;
type Store = Record<string, Record<string, Doc>>;
type Ref = { col: string; id: string };

/** Just enough of Firestore: doc get and transactions with get / set / update. */
function fakeDb(store: Store): Firestore {
  const snap = (col: string, id: string) => {
    const d = store[col]?.[id];
    return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined) };
  };
  const put = (ref: Ref, d: Doc) => { store[ref.col] = { ...(store[ref.col] ?? {}), [ref.id]: d }; };
  const db = {
    collection: (col: string) => ({ doc: (id: string) => ({ col, id, get: async () => snap(col, id) }) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn({
      get: async (ref: Ref) => snap(ref.col, ref.id),
      set: (ref: Ref, d: Doc) => put(ref, d),
      update: (ref: Ref, d: Doc) => put(ref, { ...store[ref.col][ref.id], ...d }),
    }),
  };
  return db as unknown as Firestore;
}

const seed = (): Store => ({
  invoices: {
    inv1: {
      tenants: ['kring'], accountingTenantId: 'bka', state: 'pending', invoiceId: '202600001',
      totalAmount: { amount: 5000, currency: 'CHF' }, payments: [], receiver: { key: 'scs', name1: '', name2: 'Seeclub', modelType: 'org' },
    },
  },
  'accounting-configs': {
    bka: { tenants: ['kring'], receivablesAccountKey: 'acc-1100', invoicePaymentAccountKeys: ['acc-1021'], fiscalYearStart: 1 },
  },
});

const input = { tenantId: 'kring', invoiceKey: 'inv1', paymentId: 'stripepi3AbC123', date: '20261109', amount: 5000, bankAccountKey: 'acc-1021', actor: 'stripe' };
const bookingKey = 'invoice-inv1-pay-stripepi3AbC123';

describe('postInvoicePayment', () => {
  beforeEach(() => vi.mocked(writeFinanceHistory).mockClear());

  it('books the payment once and marks the invoice paid', async () => {
    const store = seed();
    const r = await postInvoicePayment(fakeDb(store), input);
    expect(r).toMatchObject({ state: 'paid', bookingKey, duplicate: false });
    expect(Object.keys(store['bookings'])).toEqual([bookingKey]);
    expect(Object.keys(store['booking-lines'])).toEqual([`${bookingKey}-0`, `${bookingKey}-1`]);
    expect(store['invoices']['inv1']['payments']).toHaveLength(1);
    expect(writeFinanceHistory).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ uid: 'stripe', tenantId: 'kring' }));
  });

  it('the same paymentId a second time returns duplicate: true and writes one booking', async () => {
    const store = seed();
    const db = fakeDb(store);
    await postInvoicePayment(db, input);
    const second = await postInvoicePayment(db, input);
    expect(second).toMatchObject({ state: 'paid', bookingKey, duplicate: true });
    expect(Object.keys(store['bookings'])).toHaveLength(1);
    expect(store['invoices']['inv1']['payments']).toHaveLength(1);
    expect(writeFinanceHistory).toHaveBeenCalledTimes(1);
  });

  it('refuses a bank account that is not a payment account of the books', async () => {
    await expect(postInvoicePayment(fakeDb(seed()), { ...input, bankAccountKey: 'acc-9999' }))
      .rejects.toMatchObject({ details: { reason: 'not-a-payment-account' } });
  });

  it('refuses an overpayment as payment-blocked', async () => {
    await expect(postInvoicePayment(fakeDb(seed()), { ...input, amount: 6000 }))
      .rejects.toMatchObject({ details: { reason: 'payment-blocked', reasons: ['overpayment'] } });
  });
});
