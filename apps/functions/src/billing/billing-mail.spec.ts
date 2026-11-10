/** Billing mails: recipient choice, links, amount format, one doc per deterministic id. */
import { describe, expect, it, vi } from 'vitest';

const tenantAdmin = vi.fn(async () => ({ key: 'p1' }));
vi.mock('../collection/payment-method', () => ({ appOriginOf: vi.fn(async () => 'https://app.seeclub.org') }));
vi.mock('../workflow/firestore-deps', () => ({
  createFirestoreDeps: vi.fn(() => ({ tenantAdmin, emailFor: async () => 'admin@seeclub.org' })),
  translateMessage: vi.fn(async (_t: string, key: string) => key),
}));

import type { Firestore } from 'firebase-admin/firestore';
import { formatChf, notifyChargeFailed, notifyClosing, notifyPastDue } from './billing-mail';

type Row = { payload: { to: string; subject: string; body: string } };

function stubDb(store: Record<string, Record<string, unknown>>, creates = { n: 0 }): Firestore {
  const doc = (path: string) => ({
    get: async () => ({ exists: store[path] !== undefined, data: () => store[path] }),
    create: async (d: Record<string, unknown>) => {
      creates.n++;
      if (store[path]) throw { code: 6 };
      store[path] = d;
    },
  });
  return { collection: (c: string) => ({ doc: (id: string) => doc(`${c}/${id}`) }) } as unknown as Firestore;
}

describe('formatChf', () => {
  it('uses two decimals and the Swiss thousands separator', () => {
    expect(formatChf(12345)).toBe('123.45');
    expect(formatChf(123456789)).toBe('1’234’567.89');
    expect(formatChf(5)).toBe('0.05');
  });
});

describe('notifyChargeFailed', () => {
  it('mails billingEmail with pay and billing links and a formatted amount', async () => {
    const store: Record<string, Record<string, unknown>> = { 'subscriptions/scs': { billingEmail: 'kasse@seeclub.org' } };
    await notifyChargeFailed(stubDb(store), 'scs', { invoiceKey: 'inv-1', amount: 123450, attempt: 2 });
    const row = store['workflow-outbox/billing-charge-failed-inv-1-2'] as unknown as Row;
    expect(row.payload.to).toBe('kasse@seeclub.org');
    expect(row.payload.body).toContain('CHF 1’234.50');
    expect(row.payload.body).toContain('href="https://app.seeclub.org/pay/inv-1"');
    expect(row.payload.body).toContain('href="https://app.seeclub.org/billing"');
    expect(row.payload.body + row.payload.subject).not.toContain('!');
  });

  it('falls back to the tenant admin without billingEmail', async () => {
    const store: Record<string, Record<string, unknown>> = {};
    await notifyChargeFailed(stubDb(store), 'scs', { invoiceKey: 'inv-1', amount: 100, attempt: 1 });
    expect((store['workflow-outbox/billing-charge-failed-inv-1-1'] as unknown as Row).payload.to).toBe('admin@seeclub.org');
  });

  it('queues once for the same input (create conflict ignored)', async () => {
    const store: Record<string, Record<string, unknown>> = { 'subscriptions/scs': { billingEmail: 'k@x.ch' } };
    const creates = { n: 0 };
    const input = { invoiceKey: 'inv-1', amount: 100, attempt: 1 };
    await notifyChargeFailed(stubDb(store, creates), 'scs', input);
    await notifyChargeFailed(stubDb(store, creates), 'scs', input);
    expect(Object.keys(store).filter((k) => k.startsWith('workflow-outbox/'))).toHaveLength(1);
  });
});

describe('notifyPastDue / notifyClosing', () => {
  it('pastDue: one invoice links its pay page, several link /billing, id carries the date', async () => {
    const store: Record<string, Record<string, unknown>> = { 'subscriptions/scs': { billingEmail: 'k@x.ch' } };
    await notifyPastDue(stubDb(store), 'scs', { invoiceKeys: ['inv-1'], pastDueSince: '20261101' });
    const one = store['workflow-outbox/billing-pastdue-scs-20261101'] as unknown as Row;
    expect(one.payload.body).toContain('https://app.seeclub.org/pay/inv-1');
    expect(one.payload.body).toContain('innert 30 Tagen');
    await notifyPastDue(stubDb(store), 'scs', { invoiceKeys: ['a', 'b'], pastDueSince: '20261102' });
    expect((store['workflow-outbox/billing-pastdue-scs-20261102'] as unknown as Row).payload.body).toContain('https://app.seeclub.org/billing');
  });

  it('closing: deterministic id, billing link, no exclamation mark', async () => {
    const store: Record<string, Record<string, unknown>> = {};
    await notifyClosing(stubDb(store), 'scs', { closingSince: '20261201' });
    const row = store['workflow-outbox/billing-closing-scs-20261201'] as unknown as Row;
    expect(row.payload.to).toBe('admin@seeclub.org');
    expect(row.payload.body).toContain('https://app.seeclub.org/billing');
    expect(row.payload.body + row.payload.subject).not.toContain('!');
  });

  it('ignores ALREADY_EXISTS from a racing writer', async () => {
    const store: Record<string, Record<string, unknown>> = { 'subscriptions/scs': { billingEmail: 'k@x.ch' } };
    const db = stubDb(store);
    const spy = vi.spyOn(db, 'collection').mockImplementation(((c: string) => ({
      doc: (id: string) => (c === 'workflow-outbox'
        ? { get: async () => ({ exists: false }), create: async () => { throw { code: 6 }; } }
        : { get: async () => ({ data: () => store[`${c}/${id}`] }) }),
    })) as never);
    await expect(notifyClosing(db, 'scs', { closingSince: '20261201' })).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
