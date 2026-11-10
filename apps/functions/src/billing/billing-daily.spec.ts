/** Daily billing job (plan 2 Task 5): retries, due dates, state transitions, mails; the paid trigger's state part. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ store: {} as Record<string, Record<string, unknown>> }));

vi.mock('./billing-mail', () => ({
  notifyChargeFailed: vi.fn(async () => undefined),
  notifyPastDue: vi.fn(async () => undefined),
  notifyClosing: vi.fn(async () => undefined),
}));
// the webhook's settle path: records the payment, which pays the invoice
vi.mock('../collection/stripe-webhook', () => ({
  settleSucceededPayment: vi.fn(async (_db: unknown, _deps: unknown, action: { attemptKey: string }) => {
    const invoiceKey = String(h.store[`payment-attempts/${action.attemptKey}`]?.['invoiceKey']);
    h.store[`invoices/${invoiceKey}`] = { ...h.store[`invoices/${invoiceKey}`], state: 'paid' };
    h.store[`payment-attempts/${action.attemptKey}`] = { ...h.store[`payment-attempts/${action.attemptKey}`], state: 'succeeded' };
    return { state: 'handled' };
  }),
}));

import { settleSucceededPayment } from '../collection/stripe-webhook';
import type { PaymentIntentInfo } from '../collection/stripe-port';
import { notifyChargeFailed, notifyClosing, notifyPastDue } from './billing-mail';
import { runBillingDaily, subscriptionInvoicePaid } from './billing-daily';
import { fakeDb, type Store } from '../credit/testing/credit-fake-db';

const log = () => undefined;
const KEY = 'billing-scs-202612';
const KEY2 = 'billing-scs-202611';
const SUB = 'subscriptions/scs';
const ATTEMPT = `payment-attempts/auto-${KEY}`;

const invoice = (over: Record<string, unknown> = {}) => ({
  tenants: ['kring'], accountingTenantId: 'bka', billingKind: 'subscription', receiver: { key: 'scs' }, state: 'pending',
  invoiceNo: 202600042, invoiceDate: '20261201', dueDate: '20261211', totalAmount: { amount: 5000, currency: 'CHF' }, payments: [],
  ...over,
});
const attempt = (over: Record<string, unknown> = {}) => ({
  tenants: ['kring'], payerTenantId: 'scs', accountingTenantId: 'bka', purpose: 'invoice', invoiceKey: KEY, amount: 5000,
  offSession: true, state: 'failed', stripePaymentIntentId: 'pi_1', stripeChargeId: '', retryCount: 0, nextRetryAt: '20261204',
  ...over,
});
const seed = (sub: Record<string, unknown> = {}, extra: Store = {}): Store => ({
  'platform-config/billing': { operatorTenantId: 'kring', accountingTenantId: 'bka' },
  [SUB]: {
    billing: 'stripe', state: 'active', pastDueSince: '', closingSince: '', autopay: true, stripeCustomerId: 'cus_1',
    paymentMethod: { stripePaymentMethodId: 'pm_2' }, ...sub,
  },
  [`invoices/${KEY}`]: invoice(),
  [ATTEMPT]: attempt(),
  ...extra,
});
const intent = (status: string, id = 'pi_1'): PaymentIntentInfo => ({ id, status, amountReceived: 5000, chargeId: `ch_${id}`, created: 1796000000, currency: 'chf' });
const port = (opts: { charge?: string; earlier?: PaymentIntentInfo | null } = {}) => ({
  chargeOffSession: vi.fn(async () => ({ id: 'pi_new', status: opts.charge ?? 'requires_payment_method', chargeId: 'ch_new' })),
  retrievePaymentIntent: vi.fn(async (id: string) => opts.earlier ?? intent('requires_payment_method', id)),
  findPaymentIntentByInvoiceKey: vi.fn(async () => (opts.earlier === undefined ? intent('requires_payment_method') : opts.earlier)),
  feeOfCharge: vi.fn(async () => 0), paymentMethodDisplay: vi.fn(), setupIntentPaymentMethod: vi.fn(), detachPaymentMethod: vi.fn(),
});
const run = async (store: Store, today: string, p = port()) => {
  h.store = store;
  await runBillingDaily(fakeDb(store), today, () => p, log);
  return p;
};

beforeEach(() => {
  vi.mocked(notifyChargeFailed).mockClear();
  vi.mocked(notifyPastDue).mockClear();
  vi.mocked(notifyClosing).mockClear();
  vi.mocked(settleSucceededPayment).mockClear();
});

describe('runBillingDaily: retries', () => {
  it('a retry not yet due charges nothing, but the failed first charge moves active → pastDue (mail)', async () => {
    const store = seed();
    const p = await run(store, '20261202');
    expect(p.chargeOffSession).not.toHaveBeenCalled();
    expect(store[SUB]).toMatchObject({ state: 'pastDue', pastDueSince: '20261202', closingSince: '' });
    expect(notifyPastDue).toHaveBeenCalledWith(expect.anything(), 'scs', { invoiceKeys: [KEY], pastDueSince: '20261202' });
  });

  it('a due retry reads the earlier PaymentIntent back, charges with <invoiceKey>-r1 and plans day 7 on a decline', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261202' });
    const p = await run(store, '20261204');
    expect(p.retrievePaymentIntent).toHaveBeenCalledWith('pi_1');
    expect(p.chargeOffSession).toHaveBeenCalledTimes(1);
    expect(p.chargeOffSession).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cus_1', paymentMethodId: 'pm_2', amount: 5000, idempotencyKey: `${KEY}-r1`,
      metadata: expect.objectContaining({ attemptKey: `auto-${KEY}`, purpose: 'invoice', invoiceKey: KEY, tenantId: 'scs' }),
    }));
    expect(store[ATTEMPT]).toMatchObject({ state: 'failed', retryCount: 1, nextRetryAt: '20261208', stripePaymentIntentId: 'pi_new' });
    expect(notifyChargeFailed).toHaveBeenCalledWith(expect.anything(), 'scs', { invoiceKey: KEY, amount: 5000, attempt: 2 });
    expect(store[SUB]).toMatchObject({ state: 'pastDue', pastDueSince: '20261202' });
    expect(notifyPastDue).not.toHaveBeenCalled(); // not entering, already there
  });

  it('a retry on a missed day still runs (nextRetryAt in the past)', async () => {
    const store = seed();
    const p = await run(store, '20261206');
    expect(p.chargeOffSession).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `${KEY}-r1` }));
  });

  it('a succeeded retry leaves the attempt open with the next read-back day, no failure mail', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261202' });
    await run(store, '20261204', port({ charge: 'succeeded' }));
    expect(store[ATTEMPT]).toMatchObject({ state: 'open', retryCount: 1, nextRetryAt: '20261208', stripePaymentIntentId: 'pi_new', error: '' });
    expect(notifyChargeFailed).not.toHaveBeenCalled();
  });

  it('a third failed retry plans no fourth', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261202' }, { [ATTEMPT]: attempt({ retryCount: 2, nextRetryAt: '20261215' }) });
    const p = await run(store, '20261215');
    expect(p.chargeOffSession).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `${KEY}-r3` }));
    expect(store[ATTEMPT]).toMatchObject({ state: 'failed', retryCount: 3, nextRetryAt: '' });
    expect(notifyChargeFailed).toHaveBeenCalledWith(expect.anything(), 'scs', expect.objectContaining({ attempt: 4 }));
    const later = port();
    await run(store, '20261216', later);
    await run(store, '20261229', later);
    expect(later.chargeOffSession).not.toHaveBeenCalled();
  });

  it('never retries past the plan even when a nextRetryAt is left over', async () => {
    const store = seed({}, { [ATTEMPT]: attempt({ retryCount: 3, nextRetryAt: '20261215' }) });
    const p = await run(store, '20261215');
    expect(p.chargeOffSession).not.toHaveBeenCalled();
  });

  it('a retry whose previous PaymentIntent succeeded (lost webhook) is settled, not charged, and returns to active', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261202' });
    const p = await run(store, '20261204', port({ earlier: intent('succeeded') }));
    expect(p.chargeOffSession).not.toHaveBeenCalled();
    expect(settleSucceededPayment).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      kind: 'payment-succeeded', attemptKey: `auto-${KEY}`, paymentIntentId: 'pi_1', amount: 5000,
    }));
    expect(store[SUB]).toMatchObject({ state: 'active', pastDueSince: '', closingSince: '' });
  });

  it('a previous PaymentIntent still in flight is waited for: no charge, attempt unchanged', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261202' });
    const p = await run(store, '20261204', port({ earlier: intent('processing') }));
    expect(p.chargeOffSession).not.toHaveBeenCalled();
    expect(store[ATTEMPT]).toMatchObject({ retryCount: 0, nextRetryAt: '20261204', stripePaymentIntentId: 'pi_1' });
  });

  it('without a stored PaymentIntent the read-back searches by invoice key', async () => {
    const store = seed({}, { [ATTEMPT]: attempt({ stripePaymentIntentId: '' }) });
    const p = await run(store, '20261204');
    expect(p.retrievePaymentIntent).not.toHaveBeenCalled();
    expect(p.findPaymentIntentByInvoiceKey).toHaveBeenCalledWith(KEY);
    expect(p.chargeOffSession).toHaveBeenCalled();
  });

  it('QR payment while a retry is due: no charge, state active', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261202' }, { [`invoices/${KEY}`]: invoice({ state: 'paid' }) });
    const p = await run(store, '20261204');
    expect(p.chargeOffSession).not.toHaveBeenCalled();
    expect(p.retrievePaymentIntent).not.toHaveBeenCalled();
    expect(store[SUB]).toMatchObject({ state: 'active', pastDueSince: '' });
  });

  it('charges only the open amount after a partial payment', async () => {
    const store = seed({}, { [`invoices/${KEY}`]: invoice({ state: 'partial', payments: [{ date: '20261203', amount: 2000, bankAccountKey: 'b' }] }) });
    const p = await run(store, '20261204');
    expect(p.chargeOffSession).toHaveBeenCalledWith(expect.objectContaining({ amount: 3000 }));
  });

  it('a tenant without autopay is not charged', async () => {
    const store = seed({ autopay: false });
    const p = await run(store, '20261204');
    expect(p.chargeOffSession).not.toHaveBeenCalled();
  });

  it('a cancelled or closed tenant is not charged and does not change', async () => {
    for (const state of ['cancelled', 'closed']) {
      const store = seed({ state });
      const p = await run(store, '20261204');
      expect(p.chargeOffSession).not.toHaveBeenCalled();
      expect(store[SUB]).toMatchObject({ state });
    }
  });

  it('only subscriptions with billing stripe are processed', async () => {
    const store = seed({ billing: 'exempt' });
    const p = await run(store, '20261204');
    expect(p.chargeOffSession).not.toHaveBeenCalled();
    expect(store[SUB]).toMatchObject({ state: 'active' });
  });
});

describe('runBillingDaily: review fixes', () => {
  it('a retry charged and paid (fast webhook) before the transition: active, no pastDue mail', async () => {
    const store = seed();
    const p = port({ charge: 'succeeded' });
    p.chargeOffSession.mockImplementationOnce(async () => {
      store[`invoices/${KEY}`] = { ...store[`invoices/${KEY}`], state: 'paid' }; // the webhook pays the invoice
      return { id: 'pi_new', status: 'succeeded', chargeId: 'ch_new' };
    });
    await run(store, '20261212', p); // retry on a missed day, invoice due 20261211
    expect(p.chargeOffSession).toHaveBeenCalledTimes(1);
    expect(store[SUB]).toMatchObject({ state: 'active', pastDueSince: '' });
    expect(notifyPastDue).not.toHaveBeenCalled();
  });

  it('an invoice with a retry charged today is not overdue', async () => {
    const store = seed();
    await run(store, '20261212', port({ charge: 'processing' }));
    expect(store[SUB]).toMatchObject({ state: 'active' });
    expect(notifyPastDue).not.toHaveBeenCalled();
  });

  it('a failing mail queue leaves the state unchanged; the next run mails and commits', async () => {
    const store = seed({ autopay: false });
    delete store[ATTEMPT];
    vi.mocked(notifyPastDue).mockRejectedValueOnce(new Error('outbox down'));
    await expect(run(store, '20261212')).rejects.toThrow(/1 of 1/);
    expect(store[SUB]).toMatchObject({ state: 'active', pastDueSince: '' });
    await run(store, '20261212');
    expect(notifyPastDue).toHaveBeenCalledTimes(2);
    expect(notifyPastDue).toHaveBeenLastCalledWith(expect.anything(), 'scs', { invoiceKeys: [KEY], pastDueSince: '20261212' });
    expect(store[SUB]).toMatchObject({ state: 'pastDue', pastDueSince: '20261212' });
  });

  it('a retry on a missed day never leaves the next one due today: a second run charges nothing', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261202' });
    const p = port({ charge: 'succeeded' });
    await run(store, '20261210', p); // planned day 7 (20261208) is already past
    expect(store[ATTEMPT]).toMatchObject({ retryCount: 1, nextRetryAt: '20261211' });
    await run(store, '20261210', p);
    expect(p.chargeOffSession).toHaveBeenCalledTimes(1);
  });

  it('a declined retry on a missed day plans tomorrow at the earliest', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261202' });
    await run(store, '20261210');
    expect(store[ATTEMPT]).toMatchObject({ state: 'failed', retryCount: 1, nextRetryAt: '20261211' });
  });

  it('a charged third retry gets a read-back-only pass in 3 days: a lost webhook is settled, nothing charged', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261202' }, { [ATTEMPT]: attempt({ retryCount: 2, nextRetryAt: '20261215' }) });
    await run(store, '20261215', port({ charge: 'succeeded' }));
    expect(store[ATTEMPT]).toMatchObject({ state: 'open', retryCount: 3, nextRetryAt: '20261218', stripePaymentIntentId: 'pi_new' });
    const later = port({ earlier: intent('succeeded', 'pi_new') });
    await run(store, '20261218', later);
    expect(later.retrievePaymentIntent).toHaveBeenCalledWith('pi_new');
    expect(later.chargeOffSession).not.toHaveBeenCalled();
    expect(settleSucceededPayment).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ paymentIntentId: 'pi_new' }));
    expect(store[SUB]).toMatchObject({ state: 'active' });
  });

  it('the read-back-only pass of a failed third retry charges nothing and ends the plan', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261202' }, { [ATTEMPT]: attempt({ state: 'open', retryCount: 3, nextRetryAt: '20261218', stripePaymentIntentId: 'pi_3' }) });
    const p = port({ earlier: intent('requires_payment_method', 'pi_3') });
    await run(store, '20261218', p);
    expect(p.chargeOffSession).not.toHaveBeenCalled();
    expect(store[ATTEMPT]).toMatchObject({ nextRetryAt: '' });
  });
});

describe('runBillingDaily: due dates and days', () => {
  const manual = { autopay: false };
  const noAttempt = { [ATTEMPT]: undefined as unknown as Record<string, unknown> };
  const clean = (s: Store) => { delete s[ATTEMPT]; return s; };

  it('an open invoice past its due date moves active → pastDue (not on the due date itself)', async () => {
    const store = clean(seed(manual, noAttempt));
    await run(store, '20261211');
    expect(store[SUB]).toMatchObject({ state: 'active' });
    await run(store, '20261212');
    expect(store[SUB]).toMatchObject({ state: 'pastDue', pastDueSince: '20261212' });
    expect(notifyPastDue).toHaveBeenCalledWith(expect.anything(), 'scs', { invoiceKeys: [KEY], pastDueSince: '20261212' });
  });

  it('ignores invoices of other books, top-ups, cancelled and archived ones', async () => {
    const store = clean(seed(manual, {
      [`invoices/${KEY}`]: invoice({ accountingTenantId: 'scs' }),
      'invoices/topup-1': invoice({ billingKind: 'topup' }),
      'invoices/c': invoice({ state: 'cancelled' }),
      'invoices/a': invoice({ isArchived: true }),
    }));
    await run(store, '20261220');
    expect(store[SUB]).toMatchObject({ state: 'active' });
  });

  it('pastDue → closing after exactly 30 days, not 29 (mail)', async () => {
    const store = clean(seed({ ...manual, state: 'pastDue', pastDueSince: '20261112' }, {
      [`invoices/${KEY2}`]: invoice({ invoiceDate: '20261101', dueDate: '20261111' }),
    }));
    await run(store, '20261211');
    expect(store[SUB]).toMatchObject({ state: 'pastDue' });
    expect(notifyClosing).not.toHaveBeenCalled();
    await run(store, '20261212');
    expect(store[SUB]).toMatchObject({ state: 'closing', pastDueSince: '20261112', closingSince: '20261212' });
    expect(notifyClosing).toHaveBeenCalledWith(expect.anything(), 'scs', { closingSince: '20261212', invoiceKeys: [KEY, KEY2].sort() });
  });

  it('closing → closed after exactly 30 days, not 29', async () => {
    const store = clean(seed({ ...manual, state: 'closing', pastDueSince: '20261101', closingSince: '20261201' }));
    await run(store, '20261230');
    expect(store[SUB]).toMatchObject({ state: 'closing' });
    await run(store, '20261231');
    expect(store[SUB]).toMatchObject({ state: 'closed' });
  });

  it('closing with everything paid → active', async () => {
    const store = clean(seed({ ...manual, state: 'closing', pastDueSince: '20261101', closingSince: '20261201' }, {
      [`invoices/${KEY}`]: invoice({ state: 'paid' }),
    }));
    await run(store, '20261215');
    expect(store[SUB]).toMatchObject({ state: 'active', pastDueSince: '', closingSince: '' });
  });

  it('one failing tenant does not stop the others, and the job reports it', async () => {
    const store = seed({}, { 'subscriptions/abc': { billing: 'stripe', state: 'active' } });
    const db = fakeDb(store);
    h.store = store;
    const p = port();
    p.retrievePaymentIntent.mockRejectedValueOnce(new Error('Stripe 500'));
    await expect(runBillingDaily(db, '20261204', () => p, log)).rejects.toThrow(/1 of 2/);
  });
});

describe('subscriptionInvoicePaid (onBillingInvoicePaid)', () => {
  const paid = (store: Store, key = KEY) => {
    store[`invoices/${key}`] = { ...store[`invoices/${key}`], state: 'paid' };
    h.store = store;
    return subscriptionInvoicePaid(fakeDb(store), key, store[`invoices/${key}`], '20261215', log);
  };

  it('pastDue → active once the last open subscription invoice is paid', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261202' });
    await paid(store);
    expect(store[SUB]).toMatchObject({ state: 'active', pastDueSince: '', closingSince: '' });
  });

  it('closing → active once all are paid', async () => {
    const store = seed({ state: 'closing', pastDueSince: '20261101', closingSince: '20261201' });
    await paid(store);
    expect(store[SUB]).toMatchObject({ state: 'active' });
  });

  it('stays pastDue while another subscription invoice is open', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261112' }, { [`invoices/${KEY2}`]: invoice({ dueDate: '20261111' }) });
    await paid(store);
    expect(store[SUB]).toMatchObject({ state: 'pastDue', pastDueSince: '20261112' });
  });

  it('cancelled stays cancelled', async () => {
    const store = seed({ state: 'cancelled' });
    await paid(store);
    expect(store[SUB]).toMatchObject({ state: 'cancelled' });
  });

  it('an invoice outside the operator books changes nothing', async () => {
    const store = seed({ state: 'pastDue', pastDueSince: '20261202' }, { [`invoices/${KEY}`]: invoice({ accountingTenantId: 'scs' }) });
    await paid(store);
    expect(store[SUB]).toMatchObject({ state: 'pastDue' });
  });
});
