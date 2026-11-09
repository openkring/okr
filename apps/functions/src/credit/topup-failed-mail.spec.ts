/** The mail of a failed auto top-up links the pay page of the declined top-up invoice. */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../collection/payment-method', () => ({ appOriginOf: vi.fn(async () => 'https://app.seeclub.org') }));
vi.mock('../workflow/firestore-deps', () => ({
  createFirestoreDeps: vi.fn(),
  translateMessage: vi.fn(async (_t: string, key: string) => key), // nobody entered the keys: German defaults
}));

import type { Firestore } from 'firebase-admin/firestore';
import { notifyAutoTopUpFailed, topUpPayLink } from './topup-failed-mail';

function stubDb(store: Record<string, Record<string, unknown>>): Firestore {
  const doc = (path: string) => ({
    get: async () => ({ exists: store[path] !== undefined, data: () => store[path] }),
    create: async (d: Record<string, unknown>) => { store[path] = d; },
  });
  return { collection: (c: string) => ({ doc: (id: string) => doc(`${c}/${id}`) }) } as unknown as Firestore;
}

describe('topUpPayLink', () => {
  it('is the pay page of the invoice on the tenant app', () => {
    expect(topUpPayLink('https://app.seeclub.org', 'topup-scs-20261109100000')).toBe('https://app.seeclub.org/pay/topup-scs-20261109100000');
  });
});

describe('notifyAutoTopUpFailed', () => {
  it('queues one mail to billingEmail that links /pay/<invoiceKey>, not the billing page', async () => {
    const store: Record<string, Record<string, unknown>> = { 'subscriptions/scs': { billingEmail: 'kasse@seeclub.org' } };
    await notifyAutoTopUpFailed(stubDb(store), 'scs', { attemptKey: 'auto-topup-scs-1', invoiceKey: 'topup-scs-1', amount: 10000 });
    const row = store['workflow-outbox/topup-failed-auto-topup-scs-1'] as { payload: { to: string; body: string } };
    expect(row.payload.to).toBe('kasse@seeclub.org');
    expect(row.payload.body).toContain('href="https://app.seeclub.org/pay/topup-scs-1"');
    expect(row.payload.body).not.toContain('/billing');
    expect(row.payload.body).toContain('CHF 100.00');
    expect(row.payload.body).not.toContain('!');
  });
});
