/** Auto top-up run and the credit of a paid top-up invoice, with createAndIssueInvoice and Stripe faked. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../invoice/invoice-issue.core', () => ({
  createAndIssueInvoice: vi.fn(async (...args: unknown[]) => ({ invoiceKey: (args[1] as { okey?: string } | undefined)?.okey ?? '', invoiceNo: 202600042 })),
}));

vi.mock('../collection/stripe-webhook', () => ({ settleSucceededPayment: vi.fn(async () => ({ state: 'handled' })) }));

import { createAndIssueInvoice } from '../invoice/invoice-issue.core';
import { settleSucceededPayment } from '../collection/stripe-webhook';
import type { PaymentIntentInfo } from '../collection/stripe-port';
import { creditPaidTopUp, issueTopUpInvoice, runAutoTopUp } from './topup.core';
import { fakeDb, type Store } from './testing/credit-fake-db';

const log = () => undefined;
const REQUEST = 'credit-accounts/scs/auto-top-up/request';
const fresh = { requestedAt: '20261109100000', pendingInvoiceKey: '' };
const seed = (sub: Record<string, unknown> = {}): Store => ({
  'platform-config/billing': { operatorTenantId: 'kring', accountingTenantId: 'bka' },
  'accounting-configs/bka': { tenants: ['kring'], fiscalYearStart: 1, prepaymentAccountKey: 'acc-2300', transactionRevenueAccountKey: 'acc-3200' },
  'orgs/scs': { name: 'Seeclub Stäfa' },
  'app-config/scs': { appDomain: 'app.seeclub.org' },
  'credit-accounts/scs': { tenants: ['scs'], balance: 500 },
  [REQUEST]: { requestedAt: '20261109100000', pendingInvoiceKey: '' },
  'subscriptions/scs': {
    autopay: true, stripeCustomerId: 'cus_1', autoTopUp: { enabled: true, threshold: 1000, amount: 10000 },
    paymentMethod: { stripePaymentMethodId: 'pm_1' }, ...sub,
  },
});
const intent = (status: string, id = 'pi_old'): PaymentIntentInfo => ({ id, status, amountReceived: status === 'succeeded' ? 7000 : 0, chargeId: 'ch_old', created: 1762650000, currency: 'chf' });
const port = (status: string, earlier: { retrieved?: PaymentIntentInfo; found?: PaymentIntentInfo | null } = {}) => ({
  chargeOffSession: vi.fn(async () => ({ id: 'pi_1', status, chargeId: 'ch_1' })),
  retrievePaymentIntent: vi.fn(async (id: string) => earlier.retrieved ?? intent('canceled', id)),
  findPaymentIntentByInvoiceKey: vi.fn(async () => earlier.found ?? null),
  feeOfCharge: vi.fn(async () => 0),
  paymentMethodDisplay: vi.fn(),
  setupIntentPaymentMethod: vi.fn(),
  detachPaymentMethod: vi.fn(),
});

beforeEach(() => { vi.mocked(createAndIssueInvoice).mockClear(); vi.mocked(settleSucceededPayment).mockClear(); });

describe('issueTopUpInvoice', () => {
  it('issues in the operator books to orgs/{tenant} on the prepayment account, due in 10 days', async () => {
    await issueTopUpInvoice(fakeDb(seed()), { tenantId: 'scs', amount: 5000, okey: 'topup-scs-x', actor: 'uid1' });
    expect(createAndIssueInvoice).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      okey: 'topup-scs-x', tenantId: 'kring', accountingTenantId: 'bka', billingKind: 'topup', dueDays: 10,
      receiver: expect.objectContaining({ key: 'scs', name2: 'Seeclub Stäfa', modelType: 'org' }),
      positions: [{ title: 'Guthaben-Aufladung', amount: 5000, accountKey: 'acc-2300' }],
    }));
  });

  it('refuses amounts outside CHF 50 – 5000', async () => {
    for (const amount of [4999, 500001]) {
      await expect(issueTopUpInvoice(fakeDb(seed()), { tenantId: 'scs', amount, okey: 'k', actor: 'u' })).rejects.toMatchObject({ code: 'invalid-argument' });
    }
    expect(createAndIssueInvoice).not.toHaveBeenCalled();
  });
});

describe('runAutoTopUp', () => {
  it('issues the deterministic invoice, writes the attempt, marks it pending and charges with the invoice key', async () => {
    const store = seed();
    const p = port('succeeded');
    await expect(runAutoTopUp(fakeDb(store), p, 'scs', fresh, log)).resolves.toBe('charged');
    const key = 'topup-scs-20261109100000';
    expect(p.chargeOffSession).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cus_1', paymentMethodId: 'pm_1', amount: 10000, idempotencyKey: key,
      metadata: { attemptKey: `auto-${key}`, tenantId: 'scs', accountingTenantId: 'bka', purpose: 'topup', invoiceKey: key },
    }));
    expect(store[`payment-attempts/auto-${key}`]).toMatchObject({
      tenants: ['kring'], payerTenantId: 'scs', purpose: 'topup', offSession: true, amount: 10000, state: 'open', stripePaymentIntentId: 'pi_1',
    });
    expect(store[REQUEST]).toEqual({ requestedAt: '20261109100000', pendingInvoiceKey: key, retryCount: 0 });
  });

  it('a stale pending invoice that is still open is charged again with the same okey and idempotency key', async () => {
    const store = seed();
    const key = 'topup-scs-20261108080000';
    store[REQUEST] = { requestedAt: '20261109100000', pendingInvoiceKey: key };
    store[`invoices/${key}`] = { state: 'pending', billingKind: 'topup', totalAmount: { amount: 7000 } };
    store[`payment-attempts/auto-${key}`] = { state: 'open', invoiceKey: key };
    const p = port('succeeded');
    await expect(runAutoTopUp(fakeDb(store), p, 'scs', store[REQUEST] as typeof fresh, log)).resolves.toBe('charged');
    expect(createAndIssueInvoice).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ okey: key, positions: [expect.objectContaining({ amount: 7000 })] }));
    expect(p.findPaymentIntentByInvoiceKey).toHaveBeenCalledWith(key);
    expect(p.chargeOffSession).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `${key}-r1`, amount: 7000 }));
    expect(store[REQUEST]).toMatchObject({ pendingInvoiceKey: key, retryCount: 1 });
  });

  describe('a stale re-run reads the earlier charge back first', () => {
    const KEY = 'topup-scs-20261108080000';
    const stale = (attempt: Record<string, unknown>, retryCount = 0) => {
      const store = seed();
      store[REQUEST] = { requestedAt: '20261109100000', pendingInvoiceKey: KEY, retryCount };
      store[`invoices/${KEY}`] = { state: 'pending', billingKind: 'topup', totalAmount: { amount: 7000 } };
      store[`payment-attempts/auto-${KEY}`] = { state: 'open', invoiceKey: KEY, ...attempt };
      return store;
    };
    const run = (store: Store, p: ReturnType<typeof port>) => runAutoTopUp(fakeDb(store), p, 'scs', store[REQUEST] as typeof fresh, log);

    it('succeeded: no charge, the payment is recorded through the webhook settle path', async () => {
      const store = stale({ stripePaymentIntentId: 'pi_old' });
      const p = port('succeeded', { retrieved: intent('succeeded') });
      await expect(run(store, p)).resolves.toBe('skipped');
      expect(p.retrievePaymentIntent).toHaveBeenCalledWith('pi_old');
      expect(p.chargeOffSession).not.toHaveBeenCalled();
      expect(settleSucceededPayment).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
        kind: 'payment-succeeded', attemptKey: `auto-${KEY}`, paymentIntentId: 'pi_old', chargeId: 'ch_old', amount: 7000, currency: 'chf',
      }));
    });

    it('processing: no charge, the request stays pending', async () => {
      const store = stale({ stripePaymentIntentId: 'pi_old' });
      const before = { ...store[REQUEST] };
      const p = port('succeeded', { retrieved: intent('processing') });
      await expect(run(store, p)).resolves.toBe('skipped');
      expect(p.chargeOffSession).not.toHaveBeenCalled();
      expect(settleSucceededPayment).not.toHaveBeenCalled();
      expect(store[REQUEST]).toEqual(before);
    });

    it('canceled: charged again with a fresh idempotency key -r1, the attempt follows the new PaymentIntent', async () => {
      const store = stale({ stripePaymentIntentId: 'pi_old', state: 'failed' });
      const p = port('succeeded', { retrieved: intent('canceled') });
      await expect(run(store, p)).resolves.toBe('charged');
      expect(p.chargeOffSession).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `${KEY}-r1` }));
      expect(store[`payment-attempts/auto-${KEY}`]).toMatchObject({ state: 'open', stripePaymentIntentId: 'pi_1' });
      expect(store[REQUEST]).toMatchObject({ pendingInvoiceKey: KEY, retryCount: 1 });
    });

    it('a second re-charge counts on: -r2', async () => {
      const store = stale({ stripePaymentIntentId: 'pi_old' }, 1);
      const p = port('succeeded', { retrieved: intent('requires_payment_method') });
      await run(store, p);
      expect(p.chargeOffSession).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `${KEY}-r2` }));
    });

    it('the read-back throws: no charge, the request stays pending', async () => {
      const store = stale({ stripePaymentIntentId: 'pi_old' });
      const before = { ...store[REQUEST] };
      const p = port('succeeded');
      p.retrievePaymentIntent.mockRejectedValueOnce(new Error('Stripe 500'));
      await expect(run(store, p)).rejects.toThrow('Stripe 500');
      expect(p.chargeOffSession).not.toHaveBeenCalled();
      expect(store[REQUEST]).toEqual(before);
    });

    it('the settle throws: no charge, the request stays pending', async () => {
      const store = stale({ stripePaymentIntentId: 'pi_old' });
      const before = { ...store[REQUEST] };
      const p = port('succeeded', { retrieved: intent('succeeded') });
      vi.mocked(settleSucceededPayment).mockRejectedValueOnce(new Error('period locked'));
      await expect(run(store, p)).rejects.toThrow('period locked');
      expect(p.chargeOffSession).not.toHaveBeenCalled();
      expect(store[REQUEST]).toEqual(before);
    });

    it('no PaymentIntent id (the charge call threw earlier): the search finds it succeeded, no charge', async () => {
      const store = stale({});
      const p = port('succeeded', { found: intent('succeeded', 'pi_found') });
      await expect(run(store, p)).resolves.toBe('skipped');
      expect(p.retrievePaymentIntent).not.toHaveBeenCalled();
      expect(p.findPaymentIntentByInvoiceKey).toHaveBeenCalledWith(KEY);
      expect(p.chargeOffSession).not.toHaveBeenCalled();
      expect(settleSucceededPayment).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ paymentIntentId: 'pi_found' }));
    });
  });

  it('a stale pending invoice that is paid meanwhile clears the request, nothing charged', async () => {
    const store = seed();
    const key = 'topup-scs-20261108080000';
    store[REQUEST] = { requestedAt: '20261109100000', pendingInvoiceKey: key };
    store[`invoices/${key}`] = { state: 'paid', billingKind: 'topup', totalAmount: { amount: 7000 } };
    const p = port('succeeded');
    await expect(runAutoTopUp(fakeDb(store), p, 'scs', store[REQUEST] as typeof fresh, log)).resolves.toBe('skipped');
    expect(createAndIssueInvoice).not.toHaveBeenCalled();
    expect(p.chargeOffSession).not.toHaveBeenCalled();
    expect(store[REQUEST]).toEqual({ requestedAt: '', pendingInvoiceKey: '', retryCount: 0 });
  });

  it('an error before the charge clears the request', async () => {
    const store = seed();
    vi.mocked(createAndIssueInvoice).mockRejectedValueOnce(new Error('pdf render failed'));
    const p = port('succeeded');
    await expect(runAutoTopUp(fakeDb(store), p, 'scs', fresh, log)).rejects.toThrow('pdf render failed');
    expect(p.chargeOffSession).not.toHaveBeenCalled();
    expect(store[REQUEST]).toEqual({ requestedAt: '', pendingInvoiceKey: '', retryCount: 0 });
  });

  it('a charge call that throws keeps the pending state', async () => {
    const store = seed();
    const p = { ...port('succeeded'), chargeOffSession: vi.fn(async () => { throw new Error('ECONNRESET'); }) };
    await expect(runAutoTopUp(fakeDb(store), p, 'scs', fresh, log)).rejects.toThrow('ECONNRESET');
    expect(store[REQUEST]).toEqual({ requestedAt: '20261109100000', pendingInvoiceKey: 'topup-scs-20261109100000', retryCount: 0 });
  });

  it('a declined charge switches auto top-up off itself and clears the request (no reliance on the webhook)', async () => {
    const store = seed();
    await expect(runAutoTopUp(fakeDb(store), port('requires_payment_method'), 'scs', fresh, log)).resolves.toBe('declined');
    expect(store[REQUEST]).toEqual({ requestedAt: '', pendingInvoiceKey: '', retryCount: 0 });
    expect(store['subscriptions/scs']['autoTopUp']).toEqual({ enabled: false, threshold: 1000, amount: 10000 });
  });

  it('after a declined charge the next request charges nothing', async () => {
    const store = seed();
    const db = fakeDb(store);
    await runAutoTopUp(db, port('requires_payment_method'), 'scs', fresh, log);
    const p = port('succeeded');
    await expect(runAutoTopUp(db, p, 'scs', { requestedAt: '20261109110000', pendingInvoiceKey: '' }, log)).resolves.toBe('skipped');
    expect(p.chargeOffSession).not.toHaveBeenCalled();
  });

  describe('a first run failing in the issue step', () => {
    const KEY = 'topup-scs-20261109100000';
    it('archives the draft it left behind', async () => {
      const store = seed();
      store[`invoices/${KEY}`] = { tenants: ['kring'], state: 'draft', billingKind: 'topup', invoiceNo: 0 };
      vi.mocked(createAndIssueInvoice).mockRejectedValueOnce(new Error('pdf render failed'));
      await expect(runAutoTopUp(fakeDb(store), port('succeeded'), 'scs', fresh, log)).rejects.toThrow('pdf render failed');
      expect(store[`invoices/${KEY}`]).toMatchObject({ state: 'draft', isArchived: true, tenants: ['kring'] });
      expect(store[REQUEST]).toEqual({ requestedAt: '', pendingInvoiceKey: '', retryCount: 0 });
    });

    it('leaves an issued (or issuing) invoice alone', async () => {
      for (const state of ['pending', 'issuing']) {
        const store = seed();
        store[`invoices/${KEY}`] = { tenants: ['kring'], state, billingKind: 'topup', invoiceNo: 202600042 };
        vi.mocked(createAndIssueInvoice).mockRejectedValueOnce(new Error('later step failed'));
        await expect(runAutoTopUp(fakeDb(store), port('succeeded'), 'scs', fresh, log)).rejects.toThrow('later step failed');
        expect(store[`invoices/${KEY}`]['isArchived']).toBeUndefined();
      }
    });

    it('a re-run that fails archives nothing and keeps the request pending', async () => {
      const store = seed();
      const STALE = 'topup-scs-20261108080000';
      store[REQUEST] = { requestedAt: '20261109100000', pendingInvoiceKey: STALE };
      store[`invoices/${STALE}`] = { tenants: ['kring'], state: 'draft', billingKind: 'topup', totalAmount: { amount: 7000 } };
      vi.mocked(createAndIssueInvoice).mockRejectedValueOnce(new Error('pdf render failed'));
      await expect(runAutoTopUp(fakeDb(store), port('succeeded'), 'scs', store[REQUEST] as typeof fresh, log)).rejects.toThrow('pdf render failed');
      expect(store[`invoices/${STALE}`]['isArchived']).toBeUndefined();
      expect(store[REQUEST]).toMatchObject({ pendingInvoiceKey: STALE });
    });
  });

  it('no saved method: no invoice, request cleared', async () => {
    const store = seed({ paymentMethod: null });
    const p = port('succeeded');
    await expect(runAutoTopUp(fakeDb(store), p, 'scs', fresh, log)).resolves.toBe('skipped');
    expect(createAndIssueInvoice).not.toHaveBeenCalled();
    expect(p.chargeOffSession).not.toHaveBeenCalled();
    expect(store[REQUEST]['requestedAt']).toBe('');
  });
});

describe('creditPaidTopUp', () => {
  const invoice = (o: Record<string, unknown> = {}) => ({
    billingKind: 'topup', state: 'paid', accountingTenantId: 'bka', receiver: { key: 'scs' }, totalAmount: { amount: 10000 }, ...o,
  });

  it('credits the receiver once and clears its pending auto top-up', async () => {
    const store = seed();
    store[REQUEST] = { requestedAt: '20261109100000', pendingInvoiceKey: 'inv9' };
    const db = fakeDb(store);
    await expect(creditPaidTopUp(db, 'inv9', invoice(), log)).resolves.toBe(true);
    await creditPaidTopUp(db, 'inv9', invoice(), log);
    expect(store['credit-accounts/scs']).toMatchObject({ balance: 10500 });
    expect(store[REQUEST]).toEqual({ requestedAt: '', pendingInvoiceKey: '', retryCount: 0 });
    expect(store['credit-accounts/scs/entries/topup-inv9']).toMatchObject({ kind: 'topup', amount: 10000, reference: 'inv9' });
  });

  it('a pending auto top-up of another invoice stays pending', async () => {
    const store = seed();
    store[REQUEST] = { requestedAt: '20261109100000', pendingInvoiceKey: 'other' };
    await creditPaidTopUp(fakeDb(store), 'inv9', invoice(), log);
    expect(store[REQUEST]['pendingInvoiceKey']).toBe('other');
  });

  it('refuses foreign books and a receiver that is not a tenant', async () => {
    const store = seed();
    const db = fakeDb(store);
    await expect(creditPaidTopUp(db, 'inv9', invoice({ accountingTenantId: 'scs' }), log)).resolves.toBe(false);
    await expect(creditPaidTopUp(db, 'inv9', invoice({ receiver: { key: 'p1' } }), log)).resolves.toBe(false);
    expect(store['credit-accounts/scs/entries/topup-inv9']).toBeUndefined();
  });
});
