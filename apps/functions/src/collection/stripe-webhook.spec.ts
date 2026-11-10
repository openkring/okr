/**
 * The Stripe webhook handler (plan 1.149 Task 7) against a small in-memory Firestore and a fake Stripe
 * port. postInvoicePayment runs for real; the period lock, booking numbers, Kostenstellen, leaf check and
 * history are stubbed as in invoice-payment.core.spec.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import { Timestamp } from 'firebase-admin/firestore';

vi.mock('../booking/period-lock', () => ({
  assertPeriodsOpen: vi.fn(async () => undefined),
  touchedPeriodKeys: vi.fn(() => []),
}));
vi.mock('../booking/booking-no', () => ({ allocateBookingNo: vi.fn(async () => 7) }));
vi.mock('../cost-center/cost-center-context', () => ({ loadCostCenterContext: vi.fn(async () => ({})), costCenterKeyForLine: vi.fn(() => '') }));
vi.mock('../finance-history/finance-history', () => ({ writeFinanceHistory: vi.fn(async () => undefined), chfText: vi.fn(() => ''), historyDetails: vi.fn(() => '') }));
vi.mock('../invoice/invoice-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../invoice/invoice-context')>()),
  assertLeafAccount: vi.fn(async () => undefined),
}));

import { assertPeriodsOpen } from '../booking/period-lock';
import type { StoredWebhookEvent } from '../_webhooks/types';
import { makeStripeHandler, type StripeHandlerPort } from './stripe-webhook';

type Doc = Record<string, unknown>;
type Store = Record<string, Record<string, Doc>>;
type Ref = { col: string; id: string };

/** Just enough of Firestore: doc get / set / update and transactions with get / set / update. */
function fakeDb(store: Store): Firestore {
  const snap = (col: string, id: string) => {
    const d = store[col]?.[id];
    return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined) };
  };
  const put = (ref: Ref, d: Doc) => { store[ref.col] = { ...(store[ref.col] ?? {}), [ref.id]: d }; };
  const merge = (ref: Ref, d: Doc) => {
    if (!store[ref.col]?.[ref.id]) throw new Error(`no document ${ref.col}/${ref.id}`);
    put(ref, { ...store[ref.col][ref.id], ...d });
  };
  const db = {
    collection: (col: string) => ({
      doc: (id: string) => ({
        col, id,
        get: async () => snap(col, id),
        set: async (d: Doc) => put({ col, id }, d),
        update: async (d: Doc) => merge({ col, id }, d),
      }),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn({
      get: async (ref: Ref) => snap(ref.col, ref.id),
      set: (ref: Ref, d: Doc) => put(ref, d),
      update: (ref: Ref, d: Doc) => merge(ref, d),
    }),
  };
  return db as unknown as Firestore;
}

const seed = (invoiceOverrides: Doc = {}): Store => ({
  'platform-config': { billing: { operatorTenantId: 'kring', accountingTenantId: 'bka' } },
  invoices: {
    inv1: {
      tenants: ['kring'], accountingTenantId: 'bka', state: 'pending', invoiceId: '202600001',
      totalAmount: { amount: 5000, currency: 'CHF' }, payments: [], receiver: { key: 'scs', name1: '', name2: 'Seeclub', modelType: 'org' },
      ...invoiceOverrides,
    },
  },
  'accounting-configs': {
    bka: {
      tenants: ['kring'], receivablesAccountKey: 'acc-1100', invoicePaymentAccountKeys: ['acc-1021', 'acc-1090'], fiscalYearStart: 1,
      stripeClearingAccountKey: 'acc-1090', stripeFeeAccountKey: 'acc-6840',
    },
  },
  'payment-attempts': {
    att1: {
      tenants: ['kring'], payerTenantId: 'scs', accountingTenantId: 'bka', purpose: 'invoice', invoiceKey: 'inv1',
      amount: 5000, currency: 'CHF', state: 'open', offSession: false, fee: 0, paymentBookingKey: '', feeBookingKey: '', error: '',
    },
  },
  subscriptions: {
    scs: { tenants: ['scs'], billing: 'stripe', stripeCustomerId: 'cus_1', paymentMethod: null, autopay: false },
  },
});

function fakePort(): StripeHandlerPort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    feeOfCharge: vi.fn(async (chargeId: string) => { calls.push(`fee:${chargeId}`); return 145; }),
    setupIntentPaymentMethod: vi.fn(async (id: string) => { calls.push(`seti:${id}`); return 'pm_new'; }),
    paymentMethodDisplay: vi.fn(async (id: string) => ({
      type: 'card' as const, brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030, email: '', stripePaymentMethodId: id, consentAt: '',
    })),
    detachPaymentMethod: vi.fn(async (id: string) => { calls.push(`detach:${id}`); }),
    listRefunds: vi.fn(async () => []),
  };
}

const NOW = new Date(Date.UTC(2026, 10, 9, 10, 0, 0));
const row = (payload: unknown): StoredWebhookEvent => ({
  clientId: 'stripe', type: 'stripe', tenants: [], payload, state: 'received',
  receivedAt: Timestamp.fromMillis(NOW.getTime()), expiresAt: Timestamp.fromMillis(NOW.getTime()),
});
const meta = { attemptKey: 'att1', tenantId: 'scs', accountingTenantId: 'bka', purpose: 'invoice', invoiceKey: 'inv1' };
const piObject = {
  id: 'pi_3AbC_123', amount: 5000, amount_received: 5000, currency: 'chf', latest_charge: 'ch_1', payment_method: 'pm_card', customer: 'cus_1', metadata: meta,
};
const succeededWith = (overrides: Record<string, unknown>) => row({
  id: 'evt_1', type: 'payment_intent.succeeded', created: NOW.getTime() / 1000, data: { object: { ...piObject, ...overrides } },
});
const succeeded = succeededWith({});

function setup(store: Store) {
  const port = fakePort();
  const handler = makeStripeHandler({ db: () => fakeDb(store), port: () => port, now: () => NOW, log: () => undefined });
  return { port, handler };
}

describe('stripeHandler: payment-succeeded', () => {
  beforeEach(() => vi.mocked(assertPeriodsOpen).mockClear());

  it('handled twice → one payment on the invoice, one fee booking, attempt succeeded', async () => {
    const store = seed();
    const { port, handler } = setup(store);

    const first = await handler(succeeded, 'row1');
    const second = await handler(succeeded, 'row1');

    expect(first).toEqual({ state: 'handled', tenantId: 'kring' });
    expect(second.state).toBe('ignored');
    const payBooking = 'invoice-inv1-pay-stripepi3AbC123';
    const feeBooking = 'stripe-fee-pi_3AbC_123';
    expect(Object.keys(store['bookings']).sort()).toEqual([payBooking, feeBooking].sort());
    expect(store['invoices']['inv1']['payments']).toHaveLength(1);
    expect(store['invoices']['inv1']['state']).toBe('paid');
    expect(store['booking-lines'][`${feeBooking}-0`]).toMatchObject({ accountKey: 'acc-6840', debitAmount: { amount: 145, currency: 'CHF' } });
    expect(store['booking-lines'][`${feeBooking}-1`]).toMatchObject({ accountKey: 'acc-1090', creditAmount: { amount: 145, currency: 'CHF' } });
    expect(store['bookings'][feeBooking]).toMatchObject({ accountingTenantId: 'bka', bookingNo: 7, status: 'posted', date: '20261109' });
    expect(store['payment-attempts']['att1']).toMatchObject({
      state: 'succeeded', fee: 145, paymentBookingKey: payBooking, feeBookingKey: feeBooking,
      stripePaymentIntentId: 'pi_3AbC_123', stripeChargeId: 'ch_1',
    });
    expect(port.calls).toEqual(['fee:ch_1']);
  });

  it('a retry after a failure in the fee step writes no second payment and no second fee booking', async () => {
    const store = seed();
    const { port, handler } = setup(store);
    vi.mocked(port.feeOfCharge).mockRejectedValueOnce(new Error('stripe down'));

    await expect(handler(succeeded, 'row1')).rejects.toThrow('stripe down');
    expect(store['payment-attempts']['att1']['state']).toBe('open');
    await handler(succeeded, 'row1');

    expect(store['invoices']['inv1']['payments']).toHaveLength(1);
    expect(Object.keys(store['bookings'])).toHaveLength(2);
    expect(store['payment-attempts']['att1']['state']).toBe('succeeded');
  });

  // An invoice already settled (overpaid): stripe-webhook.refund.spec.ts.

  it('an unknown attempt fails the event (money arrived that we cannot place)', async () => {
    const store = seed();
    delete store['payment-attempts']['att1'];
    const { handler } = setup(store);
    await expect(handler(succeeded, 'row1')).rejects.toThrow(/attempt att1/);
  });
});

describe('stripeHandler: payment-succeeded guards', () => {
  it('a non-CHF payment fails the attempt and posts nothing', async () => {
    const store = seed();
    const { port, handler } = setup(store);
    const out = await handler(succeededWith({ currency: 'eur' }), 'row1');
    expect(out).toEqual({ state: 'handled', tenantId: 'kring' });
    expect(store['bookings']).toBeUndefined();
    expect(store['invoices']['inv1']['payments']).toHaveLength(0);
    expect(store['payment-attempts']['att1']).toMatchObject({ state: 'failed', error: 'currency-mismatch: eur' });
    expect(port.calls).toEqual([]);
  });

  it('a different amount is still posted as received, and the mismatch is stored on the attempt', async () => {
    const store = seed();
    const { handler } = setup(store);
    await handler(succeededWith({ amount: 4000, amount_received: 4000 }), 'row1');
    expect(store['invoices']['inv1']['payments']).toMatchObject([{ amount: 4000 }]);
    expect(store['invoices']['inv1']['state']).toBe('pending');
    expect(store['payment-attempts']['att1']).toMatchObject({ state: 'succeeded', error: 'amount-mismatch: expected 5000 received 4000' });
  });

  it('an invoice of other books fails the attempt and posts nothing', async () => {
    const store = seed({ accountingTenantId: 'scs' });
    const { port, handler } = setup(store);
    const out = await handler(succeeded, 'row1');
    expect(out.state).toBe('handled');
    expect(store['bookings']).toBeUndefined();
    expect(store['payment-attempts']['att1']).toMatchObject({ state: 'failed', error: 'books-mismatch: invoice scs, operator bka' });
    expect(port.calls).toEqual([]);
  });

  it('offerSave: the card used is saved on the payer subscription with autopay, the old one detached', async () => {
    const store = seed();
    store['payment-attempts']['att1']['offerSave'] = true;
    store['subscriptions']['scs']['paymentMethod'] = { stripePaymentMethodId: 'pm_old', type: 'card' };
    const { port, handler } = setup(store);
    await handler(succeeded, 'row1');
    expect(store['subscriptions']['scs']).toMatchObject({ autopay: true, paymentMethod: { stripePaymentMethodId: 'pm_card' } });
    expect(port.calls).toEqual(['fee:ch_1', 'detach:pm_old']);
    expect(store['payment-attempts']['att1']['state']).toBe('succeeded');
  });

  it('without offerSave the card is not saved', async () => {
    const store = seed();
    const { handler } = setup(store);
    await handler(succeeded, 'row1');
    expect(store['subscriptions']['scs']).toMatchObject({ autopay: false, paymentMethod: null });
  });
});

describe('stripeHandler: payment-failed and expired', () => {
  it('payment_intent.payment_failed marks an open attempt failed', async () => {
    const store = seed();
    const { handler } = setup(store);
    const out = await handler(row({
      id: 'evt_2', type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_1', metadata: meta, last_payment_error: { message: 'Your card was declined.' } } },
    }), 'row2');
    expect(out).toEqual({ state: 'handled', tenantId: 'kring' });
    expect(store['payment-attempts']['att1']).toMatchObject({ state: 'failed', error: 'Your card was declined.', stripePaymentIntentId: 'pi_1' });
  });

  it('a failure after success changes nothing', async () => {
    const store = seed();
    store['payment-attempts']['att1']['state'] = 'succeeded';
    const { handler } = setup(store);
    const out = await handler(row({ id: 'evt_2', type: 'payment_intent.payment_failed', data: { object: { id: 'pi_1', metadata: meta } } }), 'row2');
    expect(out.state).toBe('ignored');
    expect(store['payment-attempts']['att1']['state']).toBe('succeeded');
  });

  it('a failed off-session top-up switches auto top-up off, clears it as pending and tells the admin', async () => {
    const store = seed();
    Object.assign(store['payment-attempts']['att1'], { purpose: 'topup', offSession: true, invoiceKey: 'topup-scs-1', amount: 10000 });
    store['subscriptions']['scs']['autoTopUp'] = { enabled: true, threshold: 1000, amount: 10000 };
    store['credit-accounts/scs/auto-top-up'] = { request: { requestedAt: '20261109100000', pendingInvoiceKey: 'topup-scs-1' } };
    const notify = vi.fn(async () => undefined);
    const handler = makeStripeHandler({ db: () => fakeDb(store), port: () => fakePort(), now: () => NOW, log: () => undefined, notifyTopUpFailed: notify });
    await handler(row({ id: 'evt_2', type: 'payment_intent.payment_failed', data: { object: { id: 'pi_1', metadata: { ...meta, purpose: 'topup' } } } }), 'row2');
    expect(store['subscriptions']['scs']['autoTopUp']).toEqual({ enabled: false, threshold: 1000, amount: 10000 });
    expect(store['credit-accounts/scs/auto-top-up']['request']).toEqual({ requestedAt: '', pendingInvoiceKey: '', retryCount: 0 });
    expect(notify).toHaveBeenCalledWith('scs', { attemptKey: 'att1', invoiceKey: 'topup-scs-1', amount: 10000 });
  });

  it('a failed top-up paid by hand (not off-session) leaves auto top-up alone', async () => {
    const store = seed();
    Object.assign(store['payment-attempts']['att1'], { purpose: 'topup', offSession: false });
    store['subscriptions']['scs']['autoTopUp'] = { enabled: true, threshold: 1000, amount: 10000 };
    const notify = vi.fn(async () => undefined);
    const handler = makeStripeHandler({ db: () => fakeDb(store), port: () => fakePort(), now: () => NOW, log: () => undefined, notifyTopUpFailed: notify });
    await handler(row({ id: 'evt_2', type: 'payment_intent.payment_failed', data: { object: { id: 'pi_1', metadata: meta } } }), 'row2');
    expect(store['subscriptions']['scs']['autoTopUp']).toMatchObject({ enabled: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it('checkout.session.expired marks an open attempt expired and is ignored', async () => {
    const store = seed();
    const { handler } = setup(store);
    const out = await handler(row({ id: 'evt_3', type: 'checkout.session.expired', data: { object: { mode: 'payment', metadata: meta } } }), 'row3');
    expect(out.state).toBe('ignored');
    expect(store['payment-attempts']['att1']['state']).toBe('expired');
  });
});

describe('stripeHandler: method-saved', () => {
  const setupDone = row({
    id: 'evt_4', type: 'checkout.session.completed',
    data: { object: { mode: 'setup', setup_intent: 'seti_1', customer: 'cus_1', metadata: { tenantId: 'scs' } } },
  });

  it('stores the payment method, switches autopay on and detaches the previous one', async () => {
    const store = seed();
    store['subscriptions']['scs']['paymentMethod'] = { stripePaymentMethodId: 'pm_old', type: 'card' };
    const { port, handler } = setup(store);

    const out = await handler(setupDone, 'row4');

    expect(out).toEqual({ state: 'handled', tenantId: 'scs' });
    expect(store['subscriptions']['scs']).toMatchObject({
      autopay: true,
      paymentMethod: { stripePaymentMethodId: 'pm_new', last4: '4242', consentAt: '20261109110000' },
    });
    expect(port.calls).toEqual(['seti:seti_1', 'detach:pm_old']);
  });

  it('a failing detach of the old method does not fail the event', async () => {
    const store = seed();
    store['subscriptions']['scs']['paymentMethod'] = { stripePaymentMethodId: 'pm_old', type: 'card' };
    const { port, handler } = setup(store);
    vi.mocked(port.detachPaymentMethod).mockRejectedValueOnce(new Error('already detached'));
    await expect(handler(setupDone, 'row4')).resolves.toMatchObject({ state: 'handled' });
    expect(store['subscriptions']['scs']['autopay']).toBe(true);
  });

  it('a session of another Stripe customer is ignored and changes nothing', async () => {
    const store = seed();
    store['subscriptions']['scs']['stripeCustomerId'] = 'cus_other';
    const { port, handler } = setup(store);
    const out = await handler(setupDone, 'row4');
    expect(out.state).toBe('ignored');
    expect(store['subscriptions']['scs']).toMatchObject({ autopay: false, paymentMethod: null });
    expect(port.calls).toEqual([]);
  });

  it('the same method again does not detach it', async () => {
    const store = seed();
    store['subscriptions']['scs']['paymentMethod'] = { stripePaymentMethodId: 'pm_new', type: 'card' };
    const { port, handler } = setup(store);
    await handler(setupDone, 'row4');
    expect(port.calls).toEqual(['seti:seti_1']);
  });
});

describe('stripeHandler: other events', () => {
  it('an unknown event type is ignored', async () => {
    const { handler } = setup(seed());
    expect(await handler(row({ id: 'evt_5', type: 'customer.updated', data: { object: {} } }), 'row5')).toEqual({ state: 'ignored' });
  });
});
