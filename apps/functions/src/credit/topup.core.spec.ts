/** Auto top-up run and the credit of a paid top-up invoice, with createAndIssueInvoice and Stripe faked. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../invoice/invoice-issue.core', () => ({
  createAndIssueInvoice: vi.fn(async (...args: unknown[]) => ({ invoiceKey: (args[1] as { okey?: string } | undefined)?.okey ?? '', invoiceNo: 202600042 })),
}));

import { createAndIssueInvoice } from '../invoice/invoice-issue.core';
import { creditPaidTopUp, issueTopUpInvoice, runAutoTopUp } from './topup.core';
import { fakeDb, type Store } from './testing/credit-fake-db';

const log = () => undefined;
const seed = (sub: Record<string, unknown> = {}): Store => ({
  'platform-config/billing': { operatorTenantId: 'kring', accountingTenantId: 'bka' },
  'accounting-configs/bka': { tenants: ['kring'], fiscalYearStart: 1, prepaymentAccountKey: 'acc-2300', transactionRevenueAccountKey: 'acc-3200' },
  'orgs/scs': { name: 'Seeclub Stäfa' },
  'app-config/scs': { appDomain: 'app.seeclub.org' },
  'credit-accounts/scs': { tenants: ['scs'], balance: 500, autoTopUpRequestedAt: '20261109100000', autoTopUpPendingInvoiceKey: '' },
  'subscriptions/scs': {
    autopay: true, stripeCustomerId: 'cus_1', autoTopUp: { enabled: true, threshold: 1000, amount: 10000 },
    paymentMethod: { stripePaymentMethodId: 'pm_1' }, ...sub,
  },
});
const port = (status: string) => ({ chargeOffSession: vi.fn(async () => ({ id: 'pi_1', status, chargeId: 'ch_1' })) });

beforeEach(() => vi.mocked(createAndIssueInvoice).mockClear());

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
    await expect(runAutoTopUp(fakeDb(store), p, 'scs', '20261109100000', log)).resolves.toBe('charged');
    const key = 'topup-scs-20261109100000';
    expect(p.chargeOffSession).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cus_1', paymentMethodId: 'pm_1', amount: 10000, idempotencyKey: key,
      metadata: { attemptKey: `auto-${key}`, tenantId: 'scs', accountingTenantId: 'bka', purpose: 'topup', invoiceKey: key },
    }));
    expect(store[`payment-attempts/auto-${key}`]).toMatchObject({
      tenants: ['kring'], payerTenantId: 'scs', purpose: 'topup', offSession: true, amount: 10000, state: 'open', stripePaymentIntentId: 'pi_1',
    });
    expect(store['credit-accounts/scs']['autoTopUpPendingInvoiceKey']).toBe(key);
  });

  it('a declined charge clears the request', async () => {
    const store = seed();
    await expect(runAutoTopUp(fakeDb(store), port('requires_payment_method'), 'scs', '20261109100000', log)).resolves.toBe('declined');
    expect(store['credit-accounts/scs']).toMatchObject({ autoTopUpRequestedAt: '', autoTopUpPendingInvoiceKey: '' });
  });

  it('no saved method: no invoice, request cleared', async () => {
    const store = seed({ paymentMethod: null });
    const p = port('succeeded');
    await expect(runAutoTopUp(fakeDb(store), p, 'scs', '20261109100000', log)).resolves.toBe('skipped');
    expect(createAndIssueInvoice).not.toHaveBeenCalled();
    expect(p.chargeOffSession).not.toHaveBeenCalled();
    expect(store['credit-accounts/scs']['autoTopUpRequestedAt']).toBe('');
  });
});

describe('creditPaidTopUp', () => {
  const invoice = (o: Record<string, unknown> = {}) => ({
    billingKind: 'topup', state: 'paid', accountingTenantId: 'bka', receiver: { key: 'scs' }, totalAmount: { amount: 10000 }, ...o,
  });

  it('credits the receiver once and clears its pending auto top-up', async () => {
    const store = seed();
    store['credit-accounts/scs'] = { ...store['credit-accounts/scs'], autoTopUpPendingInvoiceKey: 'inv9' };
    const db = fakeDb(store);
    await expect(creditPaidTopUp(db, 'inv9', invoice(), log)).resolves.toBe(true);
    await creditPaidTopUp(db, 'inv9', invoice(), log);
    expect(store['credit-accounts/scs']).toMatchObject({ balance: 10500, autoTopUpRequestedAt: '', autoTopUpPendingInvoiceKey: '' });
    expect(store['credit-accounts/scs/entries/topup-inv9']).toMatchObject({ kind: 'topup', amount: 10000, reference: 'inv9' });
  });

  it('a pending auto top-up of another invoice stays pending', async () => {
    const store = seed();
    store['credit-accounts/scs'] = { ...store['credit-accounts/scs'], autoTopUpPendingInvoiceKey: 'other' };
    await creditPaidTopUp(fakeDb(store), 'inv9', invoice(), log);
    expect(store['credit-accounts/scs']['autoTopUpPendingInvoiceKey']).toBe('other');
  });

  it('refuses foreign books and a receiver that is not a tenant', async () => {
    const store = seed();
    const db = fakeDb(store);
    await expect(creditPaidTopUp(db, 'inv9', invoice({ accountingTenantId: 'scs' }), log)).resolves.toBe(false);
    await expect(creditPaidTopUp(db, 'inv9', invoice({ receiver: { key: 'p1' } }), log)).resolves.toBe(false);
    expect(store['credit-accounts/scs/entries/topup-inv9']).toBeUndefined();
  });
});
