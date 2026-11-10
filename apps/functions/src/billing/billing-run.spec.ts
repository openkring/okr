/** Monthly billing run (plan 2 Task 4): requests per billable tenant, issue + charge or mail, refusals with board flags. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ store: {} as Record<string, Record<string, unknown>> }));

vi.mock('./measure', () => ({
  measureTenant: vi.fn(async () => ({ totalUsers: 30, privilegedUsers: 5, excludedUsers: 1, weighted: 40 })),
}));
vi.mock('../invoice/invoice-issue.core', () => ({
  createAndIssueInvoice: vi.fn(async (_db: unknown, input: { okey: string; tenantId: string; accountingTenantId: string; positions: { amount: number }[] }) => {
    const path = `invoices/${input.okey}`;
    if (!h.store[path]) {
      h.store[path] = {
        tenants: [input.tenantId], accountingTenantId: input.accountingTenantId, state: 'pending', invoiceNo: 202600042,
        invoiceDate: '20261201', documentKey: `doc-${input.okey}`, sentAt: '',
        totalAmount: { amount: input.positions.reduce((s, p) => s + p.amount, 0), currency: 'CHF' },
      };
    }
    return { invoiceKey: input.okey, invoiceNo: 202600042 };
  }),
}));
vi.mock('../invoice/send-invoice-email.core', () => ({
  INVOICE_MAIL_SECRETS: [],
  sendInvoiceMail: vi.fn(async (_db: unknown, _t: string, data: { invoiceKey: string }) => {
    h.store[`invoices/${data.invoiceKey}`] = { ...h.store[`invoices/${data.invoiceKey}`], sentAt: '20261201' };
    return { sentAt: '20261201', kind: 'invoice' };
  }),
}));
vi.mock('./billing-mail', () => ({
  notifyChargeFailed: vi.fn(async () => undefined),
  billingRecipient: vi.fn(async () => 'kasse@seeclub.org'),
  payLink: (origin: string, key: string) => `${origin}/pay/${key}`,
}));
vi.mock('../collection/payment-method', () => ({ appOriginOf: vi.fn(async () => 'https://app.seeclub.org') }));

import { createAndIssueInvoice } from '../invoice/invoice-issue.core';
import { sendInvoiceMail } from '../invoice/send-invoice-email.core';
import { billingRecipient, notifyChargeFailed } from './billing-mail';
import { measureTenant } from './measure';
import { AUTOPAY_NUDGE, handleBillingRunRequest, isFirstOfMonthInZurich, requestMonthlyRuns, runMonthlyBilling } from './billing-run';
import { fakeDb, type Store } from '../credit/testing/credit-fake-db';

const log = () => undefined;
const PERIOD = '202612';
const KEY = `billing-scs-${PERIOD}`;
const ATTEMPT = `payment-attempts/auto-${KEY}`;

const seed = (sub: Record<string, unknown> = {}, books: Record<string, unknown> = {}): Store => ({
  'platform-config/billing': { operatorTenantId: 'kring', accountingTenantId: 'bka' },
  'accounting-configs/bka': {
    tenants: ['kring'], vatMethod: 'exempt', subscriptionRevenueAccountKey: 'acc-3400', transactionRevenueAccountKey: 'acc-3200', ...books,
  },
  'orgs/scs': { name: 'Seeclub Stäfa' },
  'subscriptions/scs': {
    billing: 'stripe', state: 'active', billingStart: '20260101', lastRunPeriod: '', bandHistory: [], options: [],
    autopay: true, stripeCustomerId: 'cus_1', paymentMethod: { stripePaymentMethodId: 'pm_1' }, ...sub,
  },
  'credit-accounts/scs/entries/deduct-1': { kind: 'deduction', product: 'pingen-letter', amount: -420, units: 3, pages: 6, date: '20261115100000' },
  'credit-accounts/scs/entries/deduct-old': { kind: 'deduction', product: 'pingen-letter', amount: -999, units: 9, pages: 9, date: '20261031235959' },
  'credit-accounts/scs/entries/reverse-1': { kind: 'reversal', product: 'pingen-letter', amount: 140, units: 1, pages: 2, date: '20261120100000' },
});
const port = (status = 'succeeded') => ({ chargeOffSession: vi.fn(async () => ({ id: 'pi_1', status, chargeId: 'ch_1' })) });
const use = (store: Store) => { h.store = store; return fakeDb(store); };

beforeEach(() => {
  vi.mocked(createAndIssueInvoice).mockClear();
  vi.mocked(sendInvoiceMail).mockClear();
  vi.mocked(notifyChargeFailed).mockClear();
  vi.mocked(measureTenant).mockClear();
});

describe('isFirstOfMonthInZurich', () => {
  it('reads the day in Zurich, not UTC', () => {
    expect(isFirstOfMonthInZurich(new Date('2026-12-01T06:00:00Z'))).toBe(true);
    expect(isFirstOfMonthInZurich(new Date('2026-11-30T23:30:00Z'))).toBe(true); // 00:30 on Dec 1 in Zurich
    expect(isFirstOfMonthInZurich(new Date('2026-12-02T06:00:00Z'))).toBe(false);
  });
});

describe('requestMonthlyRuns', () => {
  it('writes one request per billable tenant; an exempt tenant gets none; a second job run adds nothing', async () => {
    const store = seed();
    store['subscriptions/bka'] = { billing: 'exempt', state: 'active' };
    store['subscriptions/old'] = { billing: 'stripe', state: 'closed' };
    const db = use(store);
    await expect(requestMonthlyRuns(db, '20261201')).resolves.toBe(1);
    expect(store[`subscriptions/scs/billing-runs/${PERIOD}`]).toMatchObject({ tenants: ['scs'], period: PERIOD, state: 'requested' });
    expect(store[`subscriptions/bka/billing-runs/${PERIOD}`]).toBeUndefined();
    expect(store[`subscriptions/old/billing-runs/${PERIOD}`]).toBeUndefined();
    await expect(requestMonthlyRuns(db, '20261201')).resolves.toBe(0);
  });
});

describe('runMonthlyBilling', () => {
  it('measures, issues billing-<t>-<period> to orgs/{t} due in 10 days and charges with the invoice key', async () => {
    const store = seed();
    const p = port();
    await expect(runMonthlyBilling(use(store), () => p, 'scs', PERIOD, log)).resolves.toBe('charged');
    expect(measureTenant).toHaveBeenCalledWith(expect.anything(), 'scs', '20261130');
    expect(createAndIssueInvoice).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      okey: KEY, tenantId: 'kring', accountingTenantId: 'bka', billingKind: 'subscription', dueDays: 10,
      receiver: expect.objectContaining({ key: 'scs', modelType: 'org' }),
    }));
    const { positions } = vi.mocked(createAndIssueInvoice).mock.calls[0][1];
    expect(positions[0]).toMatchObject({ accountKey: 'acc-3400' });
    expect(positions[positions.length - 1]).toMatchObject({ amount: 0, accountKey: 'acc-3200' });
    expect(positions[positions.length - 1].title).toContain('2 Briefe, 4 Seiten'); // Nov only, net of the reversal
    const total = positions.reduce((s, x) => s + x.amount, 0);
    expect(p.chargeOffSession).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cus_1', paymentMethodId: 'pm_1', amount: total, idempotencyKey: KEY,
      metadata: { attemptKey: `auto-${KEY}`, tenantId: 'scs', accountingTenantId: 'bka', purpose: 'invoice', invoiceKey: KEY },
    }));
    expect(store[ATTEMPT]).toMatchObject({
      tenants: ['kring'], payerTenantId: 'scs', accountingTenantId: 'bka', purpose: 'invoice', invoiceKey: KEY,
      offSession: true, amount: total, state: 'open', stripePaymentIntentId: 'pi_1',
    });
    expect(store['subscriptions/scs']).toMatchObject({
      lastRunPeriod: PERIOD, currentBand: expect.any(String), bandHistory: [expect.any(String)],
      lastMeasurement: { period: '202611', totalUsers: 30, privilegedUsers: 5, excludedUsers: 1, weighted: 40 }, billingFlags: [],
    });
  });

  it('two runs for the same period: one invoice, one charge', async () => {
    const store = seed();
    const db = use(store);
    const p = port();
    await runMonthlyBilling(db, () => p, 'scs', PERIOD, log);
    await runMonthlyBilling(db, () => p, 'scs', PERIOD, log);
    expect(createAndIssueInvoice).toHaveBeenCalledTimes(1);
    expect(p.chargeOffSession).toHaveBeenCalledTimes(1);
  });

  it('a retry after a thrown charge charges again with the same idempotency key, without a second invoice', async () => {
    const store = seed();
    const db = use(store);
    const p = port();
    p.chargeOffSession.mockRejectedValueOnce(new Error('Stripe 500'));
    await expect(runMonthlyBilling(db, () => p, 'scs', PERIOD, log)).rejects.toThrow('Stripe 500');
    await expect(runMonthlyBilling(db, () => p, 'scs', PERIOD, log)).resolves.toBe('charged');
    expect(createAndIssueInvoice).toHaveBeenCalledTimes(1);
    expect(p.chargeOffSession).toHaveBeenCalledTimes(2);
    expect(p.chargeOffSession.mock.calls.map((c) => (c as unknown as [{ idempotencyKey: string }])[0].idempotencyKey)).toEqual([KEY, KEY]);
  });

  it('declined charge: attempt failed, nextRetryAt = issue + 3 days, one failure mail', async () => {
    const store = seed();
    const db = use(store);
    const p = port('requires_payment_method');
    await expect(runMonthlyBilling(db, () => p, 'scs', PERIOD, log)).resolves.toBe('declined');
    expect(store[ATTEMPT]).toMatchObject({ state: 'failed', nextRetryAt: '20261204', retryCount: 0, stripePaymentIntentId: 'pi_1' });
    expect(notifyChargeFailed).toHaveBeenCalledTimes(1);
    expect(notifyChargeFailed).toHaveBeenCalledWith(expect.anything(), 'scs', expect.objectContaining({ invoiceKey: KEY, attempt: 1 }));
    await runMonthlyBilling(db, () => p, 'scs', PERIOD, log); // a retried event
    expect(notifyChargeFailed).toHaveBeenCalledTimes(1);
    expect(p.chargeOffSession).toHaveBeenCalledTimes(1);
  });

  it.each(['processing', 'succeeded'])('a %s charge plans the day-3 read-back (retryCount 0, nextRetryAt = issue + 3 days)', async (status) => {
    const store = seed();
    await expect(runMonthlyBilling(use(store), () => port(status), 'scs', PERIOD, log)).resolves.toBe('charged');
    expect(store[ATTEMPT]).toMatchObject({ state: 'open', retryCount: 0, nextRetryAt: '20261204', stripePaymentIntentId: 'pi_1' });
    expect(notifyChargeFailed).not.toHaveBeenCalled();
  });

  it('decline: the failure mail goes out before the attempt is marked failed', async () => {
    const store = seed();
    let attemptStateAtMail = '';
    vi.mocked(notifyChargeFailed).mockImplementationOnce(async () => { attemptStateAtMail = String(store[ATTEMPT]?.['state']); });
    await runMonthlyBilling(use(store), () => port('requires_payment_method'), 'scs', PERIOD, log);
    expect(attemptStateAtMail).toBe('open');
    expect(store[ATTEMPT]).toMatchObject({ state: 'failed' });
  });

  it('no autopay: the invoice mail goes to the billing recipient with the pay link and the nudge, once', async () => {
    const store = seed({ autopay: false, paymentMethod: null });
    const db = use(store);
    const p = port();
    await expect(runMonthlyBilling(db, () => p, 'scs', PERIOD, log)).resolves.toBe('mailed');
    expect(p.chargeOffSession).not.toHaveBeenCalled();
    expect(sendInvoiceMail).toHaveBeenCalledWith(expect.anything(), 'kring', { invoiceKey: KEY, documentKey: `doc-${KEY}` }, expect.objectContaining({
      uid: 'system', to: ['kasse@seeclub.org'],
      extraHtml: expect.stringContaining(`https://app.seeclub.org/pay/${KEY}`),
    }));
    const { extraHtml } = vi.mocked(sendInvoiceMail).mock.calls[0][3] as { extraHtml: string };
    expect(extraHtml).toContain(AUTOPAY_NUDGE);
    expect(AUTOPAY_NUDGE).toBe('Mit einer gespeicherten Karte oder PayPal zahlst du künftig automatisch.');
    await runMonthlyBilling(db, () => p, 'scs', PERIOD, log);
    expect(sendInvoiceMail).toHaveBeenCalledTimes(1);
  });

  it('non-exempt books: no invoice, board flag vat-blocked', async () => {
    const store = seed({}, { vatMethod: 'effective' });
    await expect(runMonthlyBilling(use(store), () => port(), 'scs', PERIOD, log)).resolves.toBe('refused');
    expect(createAndIssueInvoice).not.toHaveBeenCalled();
    expect(store['subscriptions/scs']).toMatchObject({ billingFlags: ['vat-blocked'], lastRunPeriod: '' });
  });

  it('books without vatMethod are refused too (fail closed)', async () => {
    const store = seed({}, { vatMethod: undefined });
    await expect(runMonthlyBilling(use(store), () => port(), 'scs', PERIOD, log)).resolves.toBe('refused');
    expect(createAndIssueInvoice).not.toHaveBeenCalled();
  });

  it('a missing revenue account: no invoice, board flag accounts-missing', async () => {
    const store = seed({}, { transactionRevenueAccountKey: '' });
    await expect(runMonthlyBilling(use(store), () => port(), 'scs', PERIOD, log)).resolves.toBe('refused');
    expect(createAndIssueInvoice).not.toHaveBeenCalled();
    expect(store['subscriptions/scs']).toMatchObject({ billingFlags: ['accounts-missing'] });
  });

  it('individually priced (≥ 1000 weighted): no invoice, board flag individual-band, history untouched', async () => {
    vi.mocked(measureTenant).mockResolvedValueOnce({ totalUsers: 900, privilegedUsers: 200, excludedUsers: 0, weighted: 1100 });
    const store = seed({ bandHistory: ['KringXL'], billingFlags: ['vat-blocked'] });
    await expect(runMonthlyBilling(use(store), () => port(), 'scs', PERIOD, log)).resolves.toBe('refused');
    expect(createAndIssueInvoice).not.toHaveBeenCalled();
    expect(store['subscriptions/scs']).toMatchObject({ billingFlags: ['vat-blocked', 'individual-band'], bandHistory: ['KringXL'] });
  });

  it('a run that issues clears the run flags', async () => {
    const store = seed({ billingFlags: ['vat-blocked', 'individual-band'] });
    await runMonthlyBilling(use(store), () => port(), 'scs', PERIOD, log);
    expect(store['subscriptions/scs']).toMatchObject({ billingFlags: [] });
  });

  it('stores its plan on the run doc before issuing, then moves through the phases', async () => {
    const store = seed();
    const db = use(store);
    vi.mocked(createAndIssueInvoice).mockImplementationOnce(async () => {
      expect(store[`subscriptions/scs/billing-runs/${PERIOD}`]).toMatchObject({
        phase: 'issuing', invoiceKey: KEY, operatorTenantId: 'kring', accountingTenantId: 'bka',
        measurement: { weighted: 40 }, positions: expect.any(Array), band: expect.any(String),
      });
      throw new Error('stop here');
    });
    await expect(runMonthlyBilling(db, () => port(), 'scs', PERIOD, log)).rejects.toThrow('stop here');
    await runMonthlyBilling(db, () => port(), 'scs', PERIOD, log);
    expect(store[`subscriptions/scs/billing-runs/${PERIOD}`]).toMatchObject({ phase: 'collected' });
  });

  it('crash after the issue: the retry reuses the plan, updates the subscription and charges once, whatever changed meanwhile', async () => {
    const store = seed();
    const db = use(store);
    const p = port();
    const issue = vi.mocked(createAndIssueInvoice).getMockImplementation()!;
    vi.mocked(createAndIssueInvoice).mockImplementationOnce(async (...args) => {
      await issue(...args); // the invoice is issued ...
      throw new Error('instance died'); // ... but the subscription update never happens
    });
    await expect(runMonthlyBilling(db, () => p, 'scs', PERIOD, log)).rejects.toThrow('instance died');
    expect(store['subscriptions/scs']).toMatchObject({ lastRunPeriod: '' });
    const firstPositions = vi.mocked(createAndIssueInvoice).mock.calls[0][1].positions;

    store['subscriptions/scs'] = { ...store['subscriptions/scs'], billing: 'exempt' }; // switched meanwhile
    vi.mocked(measureTenant).mockResolvedValueOnce({ totalUsers: 300, privilegedUsers: 50, excludedUsers: 0, weighted: 400 });

    await expect(runMonthlyBilling(db, () => p, 'scs', PERIOD, log)).resolves.toBe('charged');
    expect(measureTenant).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createAndIssueInvoice).mock.calls[1][1].positions).toEqual(firstPositions);
    expect(p.chargeOffSession).toHaveBeenCalledTimes(1);
    expect(store['subscriptions/scs']).toMatchObject({ lastRunPeriod: PERIOD, lastMeasurement: { weighted: 40 } });
    await runMonthlyBilling(db, () => p, 'scs', PERIOD, log);
    expect(p.chargeOffSession).toHaveBeenCalledTimes(1);
  });

  it('a cleared vat-blocked flag stays cleared when no-recipient is added later in the run', async () => {
    vi.mocked(billingRecipient).mockResolvedValueOnce('');
    const store = seed({ autopay: false, paymentMethod: null, billingFlags: ['vat-blocked'] });
    await expect(runMonthlyBilling(use(store), () => port(), 'scs', PERIOD, log)).resolves.toBe('issued');
    expect(sendInvoiceMail).not.toHaveBeenCalled();
    expect(store['subscriptions/scs']['billingFlags']).toEqual(['no-recipient']);
  });

  it('a tenant no longer billable is skipped', async () => {
    const store = seed({ state: 'closed' });
    await expect(runMonthlyBilling(use(store), () => port(), 'scs', PERIOD, log)).resolves.toBe('skipped');
    expect(createAndIssueInvoice).not.toHaveBeenCalled();
  });
});

describe('handleBillingRunRequest', () => {
  it('records the outcome on the run doc', async () => {
    const store = seed();
    store[`subscriptions/scs/billing-runs/${PERIOD}`] = { state: 'requested' };
    await handleBillingRunRequest(use(store), () => port(), 'scs', PERIOD, log);
    expect(store[`subscriptions/scs/billing-runs/${PERIOD}`]).toMatchObject({ state: 'charged', invoiceKey: KEY });
  });

  it('a permanent refusal (failed-precondition) is flagged run-failed and not retried', async () => {
    const store = seed();
    store['accounting-configs/bka'] = { ...store['accounting-configs/bka'], tenants: ['other'] }; // foreign books
    store[`subscriptions/scs/billing-runs/${PERIOD}`] = { state: 'requested' };
    await expect(handleBillingRunRequest(use(store), () => port(), 'scs', PERIOD, log)).resolves.toBeUndefined();
    expect(store['subscriptions/scs']).toMatchObject({ billingFlags: ['run-failed'] });
    expect(store[`subscriptions/scs/billing-runs/${PERIOD}`]).toMatchObject({ state: 'failed', reason: 'foreign-accounting-tenant' });
  });

  it('a transient error is rethrown, so the event is retried', async () => {
    const store = seed();
    store[`subscriptions/scs/billing-runs/${PERIOD}`] = { state: 'requested' };
    const p = port();
    p.chargeOffSession.mockRejectedValueOnce(new Error('Stripe 500'));
    await expect(handleBillingRunRequest(use(store), () => p, 'scs', PERIOD, log)).rejects.toThrow('Stripe 500');
  });
});
