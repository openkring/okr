import { describe, expect, it } from 'vitest';
import { isTenantInvoice, myInvoiceViews, MY_INVOICES_CAP } from './my-invoices.logic';

const inv = (over: Record<string, unknown> = {}) => ({
  accountingTenantId: 'bkg', receiver: { key: 'scs' }, state: 'pending', invoiceNo: 1, invoiceDate: '20261101', dueDate: '20261201',
  totalAmount: { amount: 5000 }, title: 'Kring-Abo', billingKind: 'subscription', ...over,
});

describe('myInvoiceViews', () => {
  it('includes reminder fees in the open amount, minus payments, ignoring waived fees', () => {
    const [v] = myInvoiceViews([{ id: 'a', data: inv({ reminders: [{ fee: 500 }, { fee: 900, waivedAt: '20261110' }], payments: [{ amount: 1000 }] }) }], 'bkg', 'scs');
    expect(v.totalAmount).toBe(5000);
    expect(v.openAmount).toBe(4500);
  });
  it('excludes drafts, archived, other books and other receivers', () => {
    const docs = [
      { id: 'd', data: inv({ state: 'draft' }) }, { id: 'c', data: inv({ state: 'created' }) },
      { id: 'x', data: inv({ isArchived: true }) }, { id: 'b', data: inv({ accountingTenantId: 'scs' }) },
      { id: 'o', data: inv({ receiver: { key: 'other' } }) }, { id: 'ok', data: inv() },
    ];
    expect(myInvoiceViews(docs, 'bkg', 'scs').map(v => v.invoiceKey)).toEqual(['ok']);
  });
  it('sorts newest first and caps', () => {
    const docs = Array.from({ length: MY_INVOICES_CAP + 5 }, (_, i) => ({ id: `i${i}`, data: inv({ invoiceDate: String(20260000 + i + 1), invoiceNo: i }) }));
    const out = myInvoiceViews(docs, 'bkg', 'scs');
    expect(out).toHaveLength(MY_INVOICES_CAP);
    expect(out[0].invoiceKey).toBe(`i${MY_INVOICES_CAP + 4}`);
  });
  it('isTenantInvoice rejects a missing doc', () => expect(isTenantInvoice(undefined, 'bkg', 'scs')).toBe(false));
});
