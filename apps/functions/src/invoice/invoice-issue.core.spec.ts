/**
 * createAndIssueInvoice (plan 1.149 Task 5): idempotent on okey, refuses a different invoice under the
 * same okey, and writes + issues a fresh draft. Runs the real draft and issue code against a small
 * in-memory Firestore; the render, period lock, booking numbers, Kostenstellen, leaf check, receiver
 * lookups and history are stubbed (module mocks — no seam was added to the code).
 */
import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

vi.mock('../pdf/render-document', () => ({ renderDocument: vi.fn(async () => ({ sizeBytes: 1234 })) }));
vi.mock('../_storage/private-bucket', () => ({ privateBucket: vi.fn(() => ({})) }));
vi.mock('../booking/period-lock', () => ({ assertPeriodsOpen: vi.fn(async () => undefined), touchedPeriodKeys: vi.fn(() => []) }));
vi.mock('../booking/booking-no', () => ({ allocateBookingNo: vi.fn(async () => 3) }));
vi.mock('../cost-center/cost-center-context', () => ({ loadCostCenterContext: vi.fn(async () => ({})), costCenterKeyForLine: vi.fn(() => '') }));
vi.mock('../finance-history/finance-history', () => ({ writeFinanceHistory: vi.fn(async () => undefined) }));
vi.mock('./invoice-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./invoice-context')>()),
  assertLeafAccount: vi.fn(async () => undefined),
  receiverAddress: vi.fn(async () => undefined),
  receiverGender: vi.fn(async () => undefined),
  treasurerContact: vi.fn(async () => ({})),
}));

import { renderDocument } from '../pdf/render-document';
import { createAndIssueInvoice } from './invoice-issue.core';

type Doc = Record<string, unknown>;
type Store = Record<string, Record<string, Doc>>;
type Ref = { col: string; id: string };
type Query = { col: string; field: string; value: unknown; isQuery: true };

/** Doc get, equality queries (also with limit), transactions with get / set / update; counts writes. */
function fakeDb(store: Store): { db: Firestore; writes: Ref[] } {
  const writes: Ref[] = [];
  const snap = (col: string, id: string) => {
    const d = store[col]?.[id];
    return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined) };
  };
  const run = (q: Query) => {
    const docs = Object.keys(store[q.col] ?? {}).filter((id) => store[q.col][id][q.field] === q.value).map((id) => snap(q.col, id));
    return { docs, empty: docs.length === 0 };
  };
  const query = (col: string, field: string, value: unknown) => {
    const q: Query = { col, field, value, isQuery: true };
    return { ...q, get: async () => run(q), limit: () => ({ ...q, get: async () => run(q) }) };
  };
  const put = (ref: Ref, d: Doc) => { writes.push(ref); store[ref.col] = { ...(store[ref.col] ?? {}), [ref.id]: d }; };
  const db = {
    collection: (col: string) => ({
      doc: (id: string) => ({ col, id, get: async () => snap(col, id) }),
      where: (field: string, _op: string, value: unknown) => query(col, field, value),
    }),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn({
      get: async (r: Ref | Query) => ('isQuery' in r ? run(r) : snap(r.col, r.id)),
      set: (ref: Ref, d: Doc) => put(ref, d),
      update: (ref: Ref, d: Doc) => put(ref, { ...store[ref.col][ref.id], ...d }),
    }),
  };
  return { db: db as unknown as Firestore, writes };
}

const input = {
  okey: 'topup-scs-abc', tenantId: 'kring', accountingTenantId: 'bka',
  receiver: { key: 'scs', name1: '', name2: 'Seeclub', modelType: 'org' as const, type: '', subType: '', label: '' },
  title: 'Guthaben', billingKind: 'topup' as const,
  positions: [{ title: 'Guthaben', amount: 5000, accountKey: 'acc-2030' }, { title: 'Bonus', amount: 1055, accountKey: 'acc-2030' }],
  dueDays: 10, actor: 'stripe',
};
const issued = (over: Doc = {}): Doc => ({
  tenants: ['kring'], state: 'pending', invoiceNo: 202600007, accountingTenantId: 'bka', billingKind: 'topup',
  totalAmount: { amount: 6055, currency: 'CHF' }, ...over,
});

describe('createAndIssueInvoice', () => {
  it('an issued invoice matching the input returns its key and number without writing', async () => {
    const { db, writes } = fakeDb({ invoices: { 'topup-scs-abc': issued() } });
    expect(await createAndIssueInvoice(db, input)).toEqual({ invoiceKey: 'topup-scs-abc', invoiceNo: 202600007 });
    expect(writes).toEqual([]);
  });

  it('refuses an existing invoice in other books (okey-mismatch)', async () => {
    const { db, writes } = fakeDb({ invoices: { 'topup-scs-abc': issued({ accountingTenantId: 'scs' }) } });
    await expect(createAndIssueInvoice(db, input)).rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'okey-mismatch' } });
    expect(writes).toEqual([]);
  });

  it('refuses an existing invoice with a different total (okey-mismatch)', async () => {
    const { db, writes } = fakeDb({ invoices: { 'topup-scs-abc': issued({ totalAmount: { amount: 5000, currency: 'CHF' } }) } });
    await expect(createAndIssueInvoice(db, input)).rejects.toMatchObject({ details: { reason: 'okey-mismatch', fields: ['totalAmount'] } });
    expect(writes).toEqual([]);
  });

  it('refuses an existing draft with a different billing kind (okey-mismatch)', async () => {
    const { db } = fakeDb({ invoices: { 'topup-scs-abc': issued({ state: 'draft', invoiceNo: 0, billingKind: '' }) } });
    await expect(createAndIssueInvoice(db, input)).rejects.toMatchObject({ details: { reason: 'okey-mismatch', fields: ['billingKind'] } });
  });

  it('refuses an existing invoice of another tenant', async () => {
    const { db, writes } = fakeDb({ invoices: { 'topup-scs-abc': issued({ tenants: ['scs'] }) } });
    await expect(createAndIssueInvoice(db, input)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(writes).toEqual([]);
  });

  it('refuses a position without a positive Rappen amount', async () => {
    const { db } = fakeDb({});
    await expect(createAndIssueInvoice(db, { ...input, positions: [{ title: 'x', amount: 12.5, accountKey: 'a' }] }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('refuses a negative position and an invoice of information lines only', async () => {
    const { db } = fakeDb({});
    await expect(createAndIssueInvoice(db, { ...input, positions: [{ title: 'x', amount: -100, accountKey: 'a' }] }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
    await expect(createAndIssueInvoice(db, { ...input, positions: [{ title: 'x', amount: 0, accountKey: 'a' }] }))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('a position of amount 0 becomes a text line: no amount, no account, not booked', async () => {
    const store: Store = {
      'accounting-configs': { bka: { tenants: ['kring'], receivablesAccountKey: 'acc-1100', invoiceTemplateId: 'tpl-1', fiscalYearStart: 1 } },
    };
    const { db } = fakeDb(store);
    await createAndIssueInvoice(db, {
      ...input, okey: 'billing-scs-202612', billingKind: 'subscription',
      positions: [{ title: 'Kring S', amount: 6000, accountKey: 'acc-3400' }, { title: 'Pingen aus Guthaben', amount: 0, accountKey: 'acc-3200' }],
    });
    expect(store['invoices']['billing-scs-202612']['totalAmount']).toMatchObject({ amount: 6000 });
    const text = Object.values(store['invoice-positions']).find((p) => p['name'] === 'Pingen aus Guthaben');
    expect(text).toMatchObject({ invoicePositionType: 'text', amount: 0, accountKey: '', isBillable: false });
    expect(Object.values(store['booking-lines']).map((l) => l['accountKey'])).toEqual(['acc-1100', 'acc-3400']);
  });

  it('a fresh okey writes the draft and issues it: total in Rappen, billingKind, pending with a number', async () => {
    const store: Store = {
      'accounting-configs': { bka: { tenants: ['kring'], receivablesAccountKey: 'acc-1100', invoiceTemplateId: 'tpl-1', fiscalYearStart: 1 } },
    };
    const { db } = fakeDb(store);
    const r = await createAndIssueInvoice(db, input);

    expect(r.invoiceKey).toBe('topup-scs-abc');
    expect(r.invoiceNo).toBeGreaterThan(0);
    const inv = store['invoices']['topup-scs-abc'];
    expect(inv['totalAmount']).toMatchObject({ amount: 6055, currency: 'CHF' });
    expect(inv['billingKind']).toBe('topup');
    expect(inv['state']).toBe('pending');
    expect(inv['invoiceNo']).toBe(r.invoiceNo);
    expect(inv['bookingKey']).toBe('invoice-topup-scs-abc');
    const positions = Object.values(store['invoice-positions']);
    expect(positions.map((p) => p['amount'])).toEqual([50, 10.55]); // positions store CHF
    expect(store['bookings']['invoice-topup-scs-abc']).toMatchObject({ status: 'posted', bookingNo: 3 });
    // receivables debit + one credit per revenue account (both positions share acc-2030)
    expect(Object.values(store['booking-lines']).map((l) => [l['accountKey'], (l['debitAmount'] ?? l['creditAmount']) as Doc]))
      .toEqual([['acc-1100', expect.objectContaining({ amount: 6055 })], ['acc-2030', expect.objectContaining({ amount: 6055 })]]);
    expect(renderDocument).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'tpl-1' }), 'stripe', 'kring', expect.anything());
  });
});
