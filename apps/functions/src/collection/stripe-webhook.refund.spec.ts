/**
 * The Stripe webhook handler, plan 2 Task 10: overpaid money, refunds and disputes (design §7.7), against the
 * shared in-memory Firestore (queries, arrayUnion) and a fake Stripe port. postInvoicePayment runs for real;
 * the period lock, booking numbers, Kostenstellen, leaf check and history are stubbed.
 */
import { describe, expect, it, vi } from 'vitest';
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

import type { StoredWebhookEvent } from '../_webhooks/types';
import { fakeDb, type Doc, type Store } from '../credit/testing/credit-fake-db';
import type { RefundInfo } from './stripe-port';
import { makeStripeHandler, type StripeHandlerPort } from './stripe-webhook';

const CLEARING = 'acc-1090';
const PREPAYMENT = 'acc-2030';
const FEE = 'acc-6840';
const ATTEMPT = 'payment-attempts/att1';
const SUB = 'subscriptions/scs';

const seed = (attempt: Doc = {}, invoice: Doc = {}): Store => ({
  'platform-config/billing': { operatorTenantId: 'kring', accountingTenantId: 'bka' },
  'invoices/inv1': {
    tenants: ['kring'], accountingTenantId: 'bka', state: 'pending', invoiceId: '202600001',
    totalAmount: { amount: 5000, currency: 'CHF' }, payments: [], receiver: { key: 'scs', name1: '', name2: 'Seeclub', modelType: 'org' },
    ...invoice,
  },
  'accounting-configs/bka': {
    tenants: ['kring'], receivablesAccountKey: 'acc-1100', invoicePaymentAccountKeys: ['acc-1021', CLEARING], fiscalYearStart: 1,
    stripeClearingAccountKey: CLEARING, stripeFeeAccountKey: FEE, prepaymentAccountKey: PREPAYMENT,
  },
  [ATTEMPT]: {
    tenants: ['kring'], payerTenantId: 'scs', accountingTenantId: 'bka', purpose: 'invoice', invoiceKey: 'inv1',
    amount: 5000, currency: 'CHF', state: 'open', offSession: false, fee: 0, paymentBookingKey: '', feeBookingKey: '', error: '',
    ...attempt,
  },
  [SUB]: { tenants: ['scs'], billing: 'stripe', stripeCustomerId: 'cus_1', paymentMethod: null, autopay: false, billingFlags: ['vat-blocked'] },
});

/** A settled attempt: the payment posted to its invoice. */
const POSTED: Doc = {
  state: 'succeeded', stripePaymentIntentId: 'pi_1', stripeChargeId: 'ch_1', paymentBookingKey: 'invoice-inv1-pay-stripepi1', fee: 145, feeBookingKey: 'stripe-fee-pi_1',
};
/** An overpaid attempt: the money sits on clearing / prepayment. */
const OVERPAID: Doc = { state: 'overpaid', stripePaymentIntentId: 'pi_1', stripeChargeId: 'ch_1', fee: 145, feeBookingKey: 'stripe-fee-pi_1' };

const refund = (id: string, amount: number, status = 'succeeded'): RefundInfo => ({
  id, amount, currency: 'chf', status, created: Date.UTC(2026, 10, 12, 9, 0, 0) / 1000,
});

function fakePort(refunds: RefundInfo[] = []) {
  const calls: string[] = [];
  const port = {
    calls,
    refunds,
    feeOfCharge: vi.fn(async (chargeId: string) => { calls.push(`fee:${chargeId}`); return 145; }),
    setupIntentPaymentMethod: vi.fn(async () => 'pm_new'),
    paymentMethodDisplay: vi.fn(),
    detachPaymentMethod: vi.fn(async () => undefined),
    listRefunds: vi.fn(async (chargeId: string) => { calls.push(`refunds:${chargeId}`); return port.refunds; }),
    retrievePaymentIntent: vi.fn(async (id: string) => ({
      id, status: 'succeeded', amountReceived: 5000, chargeId: 'ch_1', created: T, currency: 'chf', attemptKey: id === 'pi_1' ? 'att1' : '',
    })),
  };
  return port as typeof port & StripeHandlerPort;
}

const NOW = new Date(Date.UTC(2026, 10, 9, 10, 0, 0));
const T = NOW.getTime() / 1000;
const row = (payload: unknown): StoredWebhookEvent => ({
  clientId: 'stripe', type: 'stripe', tenants: [], payload, state: 'received',
  receivedAt: Timestamp.fromMillis(NOW.getTime()), expiresAt: Timestamp.fromMillis(NOW.getTime()),
});
const meta = { attemptKey: 'att1', tenantId: 'scs', accountingTenantId: 'bka', purpose: 'invoice', invoiceKey: 'inv1' };
const succeeded = row({
  id: 'evt_1', type: 'payment_intent.succeeded', created: T,
  data: { object: { id: 'pi_1', amount: 5000, amount_received: 5000, currency: 'chf', latest_charge: 'ch_1', customer: 'cus_1', metadata: meta } },
});
const refunded = (metadata: Doc = meta) => row({
  id: 'evt_r', type: 'charge.refunded', created: T,
  data: { object: { id: 'ch_1', object: 'charge', payment_intent: 'pi_1', amount: 5000, amount_refunded: 2000, currency: 'chf', metadata } },
});
const WITHDRAWN = { amount: -5000, fee: 1500, currency: 'chf' };
const disputeEvent = (type: string, status: string, balanceTransactions: Doc[] = [WITHDRAWN]) => row({
  id: `evt_${status}`, type, created: T,
  data: { object: {
    id: 'dp_1', object: 'dispute', charge: 'ch_1', payment_intent: 'pi_1', amount: 5000, currency: 'chf', status, reason: 'fraudulent',
    balance_transactions: balanceTransactions,
  } },
});
const refundUpdated = (status: string) => row({
  id: `evt_ru_${status}`, type: 'charge.refund.updated', created: T,
  data: { object: { id: 're_1', object: 'refund', charge: 'ch_1', payment_intent: 'pi_1', amount: 2000, currency: 'chf', status } },
});
const CREDIT = 'credit-accounts/scs';
const TOPUP: Doc = { ...POSTED, purpose: 'topup' };

function setup(store: Store, refunds: RefundInfo[] = []) {
  const port = fakePort(refunds);
  const logs: string[] = [];
  const handler = makeStripeHandler({ db: () => fakeDb(store), port: () => port, now: () => NOW, log: (_l, m) => { logs.push(m); } });
  return { port, handler, logs };
}

const bookingKeys = (store: Store) => Object.keys(store).filter(p => p.startsWith('bookings/')).map(p => p.slice('bookings/'.length)).sort();
const lines = (store: Store, bookingKey: string) => [store[`booking-lines/${bookingKey}-0`], store[`booking-lines/${bookingKey}-1`]];

describe('stripeHandler: overpaid payment', () => {
  it('books the money to prepayment and the fee once, marks the attempt overpaid and flags the payer', async () => {
    const store = seed({}, { state: 'paid', payments: [{ date: '20261101', amount: 5000, bankAccountKey: 'acc-1021', bookingKey: 'qr-1' }] });
    const { port, handler } = setup(store);

    expect(await handler(succeeded, 'row1')).toEqual({ state: 'handled', tenantId: 'kring' });
    expect(await handler(succeeded, 'row1')).toMatchObject({ state: 'ignored' });

    expect(bookingKeys(store)).toEqual(['stripe-fee-pi_1', 'stripe-overpaid-pi_1']);
    expect(lines(store, 'stripe-overpaid-pi_1')).toMatchObject([
      { accountKey: CLEARING, debitAmount: { amount: 5000, currency: 'CHF' } },
      { accountKey: PREPAYMENT, creditAmount: { amount: 5000, currency: 'CHF' } },
    ]);
    expect(store['bookings/stripe-overpaid-pi_1']).toMatchObject({ title: 'Überzahlung Rechnung 202600001', status: 'posted', date: '20261109', accountingTenantId: 'bka' });
    expect(lines(store, 'stripe-fee-pi_1')).toMatchObject([{ accountKey: FEE, debitAmount: { amount: 145 } }, { accountKey: CLEARING, creditAmount: { amount: 145 } }]);
    expect(store['invoices/inv1']['payments']).toHaveLength(1);
    expect(store[ATTEMPT]).toMatchObject({ state: 'overpaid', paymentBookingKey: '', fee: 145, feeBookingKey: 'stripe-fee-pi_1', stripeChargeId: 'ch_1' });
    expect(store[SUB]['billingFlags']).toEqual(['vat-blocked', 'overpaid']);
    expect(port.calls).toEqual(['fee:ch_1']);
  });

  it('without a prepayment account the event fails and nothing is booked or marked', async () => {
    const store = seed({}, { state: 'paid', payments: [{ date: '20261101', amount: 5000, bankAccountKey: 'acc-1021', bookingKey: 'qr-1' }] });
    store['accounting-configs/bka']['prepaymentAccountKey'] = '';
    const { handler } = setup(store);
    await expect(handler(succeeded, 'row1')).rejects.toThrow(/prepaymentAccountKey/);
    expect(bookingKeys(store)).toEqual([]);
    expect(store[ATTEMPT]['state']).toBe('open');
  });
});

describe('stripeHandler: charge.refunded', () => {
  it('a refund of an overpaid charge books prepayment → clearing once per refund id, attempt refunded', async () => {
    const store = seed(OVERPAID);
    const { handler } = setup(store, [refund('re_1', 2000)]);

    expect(await handler(refunded(), 'r1')).toEqual({ state: 'handled', tenantId: 'kring' });
    expect(await handler(refunded(), 'r1')).toEqual({ state: 'handled', tenantId: 'kring' });

    expect(bookingKeys(store)).toEqual(['stripe-refund-re_1']);
    expect(lines(store, 'stripe-refund-re_1')).toMatchObject([
      { accountKey: PREPAYMENT, debitAmount: { amount: 2000, currency: 'CHF' } },
      { accountKey: CLEARING, creditAmount: { amount: 2000, currency: 'CHF' } },
    ]);
    expect(store['bookings/stripe-refund-re_1']).toMatchObject({ date: '20261112', title: 'Stripe-Rückerstattung Rechnung 202600001' });
    expect(store[ATTEMPT]['state']).toBe('refunded');
  });

  it('a partial and then a second refund of the same charge → two bookings', async () => {
    const store = seed(OVERPAID);
    const { port, handler } = setup(store, [refund('re_1', 2000)]);
    await handler(refunded(), 'r1');
    port.refunds = [refund('re_1', 2000), refund('re_2', 3000)];
    await handler(refunded(), 'r2');

    expect(bookingKeys(store)).toEqual(['stripe-refund-re_1', 'stripe-refund-re_2']);
    expect(lines(store, 'stripe-refund-re_2')[0]).toMatchObject({ accountKey: PREPAYMENT, debitAmount: { amount: 3000 } });
    expect(store[ATTEMPT]['state']).toBe('refunded');
  });

  it('a failed or cancelled refund is not booked', async () => {
    const store = seed(OVERPAID);
    const { handler } = setup(store, [refund('re_1', 2000, 'failed'), refund('re_2', 1000, 'canceled')]);
    await handler(refunded(), 'r1');
    expect(bookingKeys(store)).toEqual([]);
    expect(store[ATTEMPT]['state']).toBe('overpaid');
  });

  it('a refund of a top-up within the balance: booking prepayment → clearing and a credit refund entry, once', async () => {
    const store = seed(TOPUP);
    store[CREDIT] = { tenants: ['scs'], balance: 10000 };
    const { handler } = setup(store, [refund('re_1', 5000)]);
    await handler(refunded(), 'r1');
    await handler(refunded(), 'r1');
    expect(bookingKeys(store)).toEqual(['stripe-refund-re_1']);
    expect(lines(store, 'stripe-refund-re_1')[0]).toMatchObject({ accountKey: PREPAYMENT, debitAmount: { amount: 5000 } });
    expect(store[`${CREDIT}/entries/refund-re_1`]).toMatchObject({ kind: 'refund', amount: -5000, balanceAfter: 5000, bookingKey: '', reference: 'inv1' });
    expect(store[CREDIT]['balance']).toBe(5000);
    expect(store[ATTEMPT]['state']).toBe('refunded');
    expect(store[SUB]['billingFlags']).toEqual(['vat-blocked']);
  });

  it('a top-up refund larger than the remaining credit takes the balance below 0 and flags credit-negative', async () => {
    const store = seed(TOPUP);
    store[CREDIT] = { tenants: ['scs'], balance: 1000 };
    const { handler } = setup(store, [refund('re_1', 5000)]);
    await handler(refunded(), 'r1');
    expect(store[CREDIT]['balance']).toBe(-4000);
    expect(store[SUB]['billingFlags']).toEqual(['vat-blocked', 'credit-negative']);
  });

  it('a refund of a payment posted to an invoice books nothing, keeps the attempt and flags the payer', async () => {
    const store = seed(POSTED);
    const { handler } = setup(store, [refund('re_1', 5000)]);
    expect(await handler(refunded(), 'r1')).toEqual({ state: 'handled', tenantId: 'kring' });
    await handler(refunded(), 'r1');
    expect(bookingKeys(store)).toEqual([]);
    expect(store[ATTEMPT]['state']).toBe('succeeded');
    expect(store[SUB]['billingFlags']).toEqual(['vat-blocked', 'refund-on-posted-payment']);
  });

  it('finds the attempt by its PaymentIntent when the charge carries no metadata', async () => {
    const store = seed(OVERPAID);
    const { handler } = setup(store, [refund('re_1', 2000)]);
    await handler(refunded({}), 'r1');
    expect(bookingKeys(store)).toEqual(['stripe-refund-re_1']);
  });

  it('a refund before the payment was recorded fails the event (replayed later)', async () => {
    const store = seed();
    const { handler } = setup(store, [refund('re_1', 2000)]);
    await expect(handler(refunded(), 'r1')).rejects.toThrow(/not settled/);
    expect(bookingKeys(store)).toEqual([]);
  });

  it('a refund of a charge we do not know fails the event', async () => {
    const store = seed(OVERPAID);
    const { handler } = setup(store, [refund('re_1', 2000)]);
    const other = row({ id: 'evt_x', type: 'charge.refunded', data: { object: { id: 'ch_x', payment_intent: 'pi_x', amount_refunded: 1, currency: 'chf' } } });
    await expect(handler(other, 'rx')).rejects.toThrow(/no payment attempt/);
  });
});

describe('stripeHandler: disputes', () => {
  it('charge.dispute.created marks the attempt disputed and flags the payer, idempotently', async () => {
    const store = seed(POSTED);
    const { handler } = setup(store);
    expect(await handler(disputeEvent('charge.dispute.created', 'needs_response'), 'd1')).toEqual({ state: 'handled', tenantId: 'kring' });
    await handler(disputeEvent('charge.dispute.created', 'needs_response'), 'd1');
    expect(store[ATTEMPT]).toMatchObject({ state: 'disputed', error: 'dispute dp_1: fraudulent' });
    expect(store[SUB]['billingFlags']).toEqual(['vat-blocked', 'disputed']);
    expect(bookingKeys(store)).toEqual([]);
  });

  it('a dispute on an attempt not yet settled only flags: the retried payment can still post', async () => {
    const store = seed();
    const { handler } = setup(store);
    await handler(disputeEvent('charge.dispute.created', 'needs_response'), 'd1');
    expect(store[ATTEMPT]['state']).toBe('open');
    expect(store[SUB]['billingFlags']).toEqual(['vat-blocked', 'disputed']);
    expect((await handler(succeeded, 'row1')).state).toBe('handled');
    expect(store[ATTEMPT]['state']).toBe('succeeded');
  });

  it('lost on a payment posted to an invoice: amount to the fee/loss account, the fee separately, once', async () => {
    const store = seed({ ...POSTED, state: 'disputed' });
    const { handler } = setup(store);
    await handler(disputeEvent('charge.dispute.closed', 'lost'), 'd2');
    await handler(disputeEvent('charge.dispute.closed', 'lost'), 'd2');
    expect(bookingKeys(store)).toEqual(['stripe-dispute-dp_1', 'stripe-dispute-fee-dp_1']);
    expect(lines(store, 'stripe-dispute-dp_1')).toMatchObject([
      { accountKey: FEE, debitAmount: { amount: 5000, currency: 'CHF' } },
      { accountKey: CLEARING, creditAmount: { amount: 5000, currency: 'CHF' } },
    ]);
    expect(lines(store, 'stripe-dispute-fee-dp_1')).toMatchObject([
      { accountKey: FEE, debitAmount: { amount: 1500 } }, { accountKey: CLEARING, creditAmount: { amount: 1500 } },
    ]);
    expect(store['bookings/stripe-dispute-dp_1']).toMatchObject({ title: 'Stripe-Rückbuchung verloren Rechnung 202600001', date: '20261109' });
    expect(store[ATTEMPT]['state']).toBe('disputed');
    expect(store[SUB]['billingFlags']).toEqual(['vat-blocked', 'disputed']);
  });

  it('lost on overpaid money: the amount comes out of prepayment, only the fee is an expense', async () => {
    const store = seed({ ...OVERPAID, state: 'disputed' });
    const { handler } = setup(store);
    await handler(disputeEvent('charge.dispute.closed', 'lost'), 'd2');
    expect(lines(store, 'stripe-dispute-dp_1')).toMatchObject([
      { accountKey: PREPAYMENT, debitAmount: { amount: 5000 } }, { accountKey: CLEARING, creditAmount: { amount: 5000 } },
    ]);
    expect(lines(store, 'stripe-dispute-fee-dp_1')[0]).toMatchObject({ accountKey: FEE, debitAmount: { amount: 1500 } });
    expect(store[`${CREDIT}/entries/dispute-dp_1`]).toBeUndefined();
  });

  it('lost on a top-up: out of prepayment plus a credit refund entry, once; below 0 flags credit-negative', async () => {
    const store = seed({ ...TOPUP, state: 'disputed' });
    store[CREDIT] = { tenants: ['scs'], balance: 2000 };
    const { handler } = setup(store);
    await handler(disputeEvent('charge.dispute.closed', 'lost'), 'd2');
    await handler(disputeEvent('charge.dispute.closed', 'lost'), 'd2');
    expect(lines(store, 'stripe-dispute-dp_1')[0]).toMatchObject({ accountKey: PREPAYMENT, debitAmount: { amount: 5000 } });
    expect(store[`${CREDIT}/entries/dispute-dp_1`]).toMatchObject({ kind: 'refund', amount: -5000, balanceAfter: -3000 });
    expect(store[CREDIT]['balance']).toBe(-3000);
    expect(store[SUB]['billingFlags']).toEqual(['vat-blocked', 'credit-negative', 'disputed']);
  });

  it('won, fee kept by Stripe: only the fee is booked, the attempt returns to succeeded', async () => {
    const store = seed({ ...POSTED, state: 'disputed' });
    const { handler } = setup(store);
    expect(await handler(disputeEvent('charge.dispute.closed', 'won', [WITHDRAWN, { amount: 5000, fee: 0, currency: 'chf' }]), 'd3'))
      .toEqual({ state: 'handled', tenantId: 'kring' });
    expect(bookingKeys(store)).toEqual(['stripe-dispute-fee-dp_1']);
    expect(store[ATTEMPT]['state']).toBe('succeeded');
  });

  it('won, fee returned by Stripe: nothing is booked', async () => {
    const store = seed({ ...POSTED, state: 'disputed' });
    const { handler } = setup(store);
    await handler(disputeEvent('charge.dispute.closed', 'won', [WITHDRAWN, { amount: 5000, fee: -1500, currency: 'chf' }]), 'd3');
    expect(bookingKeys(store)).toEqual([]);
  });

  it('won on overpaid money returns the attempt to overpaid, or to refunded when it had been refunded', async () => {
    const store = seed({ ...OVERPAID, state: 'disputed' });
    await setup(store).handler(disputeEvent('charge.dispute.closed', 'won', []), 'd3');
    expect(store[ATTEMPT]['state']).toBe('overpaid');

    const refundedStore = seed({ ...OVERPAID, state: 'disputed' });
    await setup(refundedStore, [refund('re_1', 2000)]).handler(disputeEvent('charge.dispute.closed', 'won', []), 'd3');
    expect(refundedStore[ATTEMPT]['state']).toBe('refunded');
  });

  it('a replayed payment_intent.succeeded after a refund or dispute posts nothing again', async () => {
    for (const state of ['refunded', 'disputed']) {
      const store = seed({ ...POSTED, state });
      const { handler } = setup(store);
      expect((await handler(succeeded, 'row1')).state).toBe('ignored');
      expect(bookingKeys(store)).toEqual([]);
    }
  });
});

describe('stripeHandler: charge.refund.updated', () => {
  it('a failed refund of overpaid money is reversed clearing → prepayment once, the payer flagged', async () => {
    const store = seed(OVERPAID);
    const { port, handler } = setup(store, [refund('re_1', 2000, 'pending')]);
    await handler(refunded(), 'r1');
    port.refunds = [refund('re_1', 2000, 'failed')];
    await handler(refundUpdated('failed'), 'f1');
    await handler(refundUpdated('failed'), 'f1');
    expect(bookingKeys(store)).toEqual(['stripe-refund-fail-re_1', 'stripe-refund-re_1']);
    expect(lines(store, 'stripe-refund-fail-re_1')).toMatchObject([
      { accountKey: CLEARING, debitAmount: { amount: 2000 } }, { accountKey: PREPAYMENT, creditAmount: { amount: 2000 } },
    ]);
    expect(store[SUB]['billingFlags']).toEqual(['vat-blocked', 'refund-failed']);
  });

  it('a failed top-up refund gives the credit back with a top-up entry, once', async () => {
    const store = seed(TOPUP);
    store[CREDIT] = { tenants: ['scs'], balance: 3000 };
    const { handler } = setup(store, [refund('re_1', 2000, 'pending')]);
    await handler(refunded(), 'r1');
    expect(store[CREDIT]['balance']).toBe(1000);
    await handler(refundUpdated('canceled'), 'f1');
    await handler(refundUpdated('canceled'), 'f1');
    expect(store[`${CREDIT}/entries/refund-fail-re_1`]).toMatchObject({ kind: 'topup', amount: 2000, bookingKey: '' });
    expect(store[CREDIT]['balance']).toBe(3000);
  });

  it('a failed refund that was never booked (posted payment) books nothing, only flags', async () => {
    const store = seed(POSTED);
    const { handler } = setup(store);
    await handler(refundUpdated('failed'), 'f1');
    expect(bookingKeys(store)).toEqual([]);
    expect(store[SUB]['billingFlags']).toEqual(['vat-blocked', 'refund-failed']);
  });

  it('a refund update to succeeded is ignored', async () => {
    const store = seed(OVERPAID);
    const { handler } = setup(store);
    expect((await handler(refundUpdated('succeeded'), 'f1')).state).toBe('ignored');
  });
});

describe('stripeHandler: payout.paid', () => {
  it('is ignored: the bank import matches the payout against clearing', async () => {
    const store = seed();
    const { handler } = setup(store);
    expect(await handler(row({ id: 'evt_p', type: 'payout.paid', data: { object: { id: 'po_1', amount: 10000 } } }), 'p1')).toEqual({ state: 'ignored' });
    expect(bookingKeys(store)).toEqual([]);
  });
});
