import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ db: undefined as unknown, signed: [] as string[] }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => h.db }));
vi.mock('../_storage/private-bucket', () => ({
  privateBucket: () => ({ file: (path: string) => ({ getSignedUrl: async () => { h.signed.push(path); return [`https://signed/${path}`]; } }) }),
}));

import { getMyBillingInvoicePdf, listMyBillingInvoices } from './my-invoices';
import { fakeDb, type Store } from '../credit/testing/credit-fake-db';

const call = (fn: unknown, uid: string, data: unknown = {}) =>
  (fn as { run(r: unknown): Promise<unknown> }).run({ app: {}, auth: { uid, token: {} }, data });
const inv = (over: Record<string, unknown> = {}) => ({
  tenants: ['bkg'], accountingTenantId: 'bkg', receiver: { key: 'scs' }, state: 'pending', isArchived: false, invoiceNo: 1,
  invoiceDate: '20261101', dueDate: '20261201', totalAmount: { amount: 5000 }, title: 'Abo', billingKind: 'subscription', documentKey: 'doc1', ...over,
});
const seed = (): Store => ({
  'users/admin': { roles: { admin: true }, tenants: ['scs'] },
  'users/member': { roles: {}, tenants: ['scs'] },
  'invoices/mine': inv({ reminders: [{ fee: 500 }] }),
  'invoices/draft': inv({ state: 'draft' }),
  'invoices/other': inv({ receiver: { key: 'zzz' } }),
  'finance-documents/doc1': { fullPath: 'invoices/mine.pdf', tenants: ['bkg'] },
});
beforeEach(() => { h.db = fakeDb(seed()); h.signed = []; });

describe('listMyBillingInvoices', () => {
  it('returns only the caller tenant issued invoices, open amount with reminder fees', async () => {
    const out = (await call(listMyBillingInvoices, 'admin')) as { invoiceKey: string; openAmount: number }[];
    expect(out.map(o => o.invoiceKey)).toEqual(['mine']);
    expect(out[0].openAmount).toBe(5500);
  });
  it('refuses a non-admin', async () => {
    await expect(call(listMyBillingInvoices, 'member')).rejects.toMatchObject({ code: 'permission-denied' });
  });
});

describe('getMyBillingInvoicePdf', () => {
  it('signs the PDF of an own invoice', async () => {
    expect(await call(getMyBillingInvoicePdf, 'admin', { invoiceKey: 'mine' })).toEqual({ url: 'https://signed/invoices/mine.pdf' });
  });
  it('refuses another tenant invoice', async () => {
    await expect(call(getMyBillingInvoicePdf, 'admin', { invoiceKey: 'other' })).rejects.toMatchObject({ code: 'permission-denied' });
    expect(h.signed).toEqual([]);
  });
  it('refuses a draft, a non-admin; not-found when missing', async () => {
    await expect(call(getMyBillingInvoicePdf, 'admin', { invoiceKey: 'draft' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(getMyBillingInvoicePdf, 'member', { invoiceKey: 'mine' })).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(call(getMyBillingInvoicePdf, 'admin', { invoiceKey: 'nope' })).rejects.toMatchObject({ code: 'not-found' });
  });
});
