/**
 * createAndIssueInvoice (plan 1.149 Task 5): idempotent on okey. Only the paths that end before the
 * render are run here; the issue itself is the unchanged issueInvoice logic.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

vi.mock('../pdf/render-document', () => ({ renderDocument: vi.fn() }));
vi.mock('../_storage/private-bucket', () => ({ privateBucket: vi.fn() }));

import { createAndIssueInvoice } from './invoice-issue.core';

type Doc = Record<string, unknown>;
type Store = Record<string, Record<string, Doc>>;
type Ref = { col: string; id: string };

function fakeDb(store: Store): { db: Firestore; writes: Ref[] } {
  const writes: Ref[] = [];
  const snap = (col: string, id: string) => {
    const d = store[col]?.[id];
    return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined) };
  };
  const db = {
    collection: (col: string) => ({ doc: (id: string) => ({ col, id, get: async () => snap(col, id) }) }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn({
      get: async (ref: Ref) => snap(ref.col, ref.id),
      set: (ref: Ref) => writes.push(ref),
      update: (ref: Ref) => writes.push(ref),
    }),
  };
  return { db: db as unknown as Firestore, writes };
}

const input = {
  okey: 'topup-scs-abc', tenantId: 'kring', accountingTenantId: 'bka',
  receiver: { key: 'scs', name1: '', name2: 'Seeclub', modelType: 'org' as const, type: '', subType: '', label: '' },
  title: 'Guthaben', billingKind: 'topup' as const, positions: [{ title: 'Guthaben', amount: 5000, accountKey: 'acc-2030' }],
  dueDays: 10, actor: 'stripe',
};

describe('createAndIssueInvoice', () => {
  it('returns the stored key and number of an issued invoice without writing', async () => {
    const { db, writes } = fakeDb({ invoices: { 'topup-scs-abc': { tenants: ['kring'], state: 'pending', invoiceNo: 202600007 } } });
    expect(await createAndIssueInvoice(db, input)).toEqual({ invoiceKey: 'topup-scs-abc', invoiceNo: 202600007 });
    expect(writes).toEqual([]);
  });

  it('refuses an existing invoice of another tenant', async () => {
    const { db, writes } = fakeDb({ invoices: { 'topup-scs-abc': { tenants: ['scs'], state: 'pending', invoiceNo: 1 } } });
    await expect(createAndIssueInvoice(db, input)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(writes).toEqual([]);
  });

  it('refuses a position without a positive Rappen amount', async () => {
    const { db } = fakeDb({});
    await expect(createAndIssueInvoice(db, { ...input, positions: [{ title: 'x', amount: 12.5, accountKey: 'a' }] }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
