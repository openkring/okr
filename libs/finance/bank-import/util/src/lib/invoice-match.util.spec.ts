import { describe, expect, it } from 'vitest';

import { BankImportRowModel, InvoiceModel, MoneyModel } from '@okr/shared-models';
import { generateQrReference } from '@okr/shared-util-core';

import { matchInvoicePayments } from './invoice-match.util';

const REF = generateQrReference(202600042);
const spaced = REF.replace(/^(\d{2})(\d{5})(\d{5})(\d{5})(\d{5})(\d{5})$/, '$1 $2 $3 $4 $5 $6');

function row(amount: number, patch: Partial<BankImportRowModel> = {}): BankImportRowModel {
  const r = new BankImportRowModel('scs', 'scs');
  r.okey = r.importKey = `k${amount}`;
  r.amount = new MoneyModel(amount, 'CHF');
  return Object.assign(r, patch);
}
function invoice(patch: Partial<InvoiceModel> = {}): InvoiceModel {
  const i = new InvoiceModel('scs');
  Object.assign(i, { okey: 'inv1', accountingTenantId: 'scs', invoiceId: '202600042', paymentReference: REF, state: 'pending',
    receiver: { key: 'p1', name1: 'Hans', name2: 'Muster', label: 'Hans Muster', modelType: 'person', type: '', subType: '' } });
  return Object.assign(i, patch);
}

describe('matchInvoicePayments', () => {
  it('links a credit by its camt reference and proposes the title', () => {
    const { rows, matched } = matchInvoicePayments([row(12000, { paymentReference: REF })], [invoice()], 'Zahlung Rechnung');
    expect(matched).toBe(1);
    expect(rows[0].invoiceKey).toBe('inv1');
    expect(rows[0].title).toBe('Zahlung Rechnung 202600042 Hans Muster');
  });
  it('finds a spaced reference in CSV text and keeps a title set by a rule', () => {
    const { rows } = matchInvoicePayments([row(12000, { rawText: `Gutschrift ${spaced}`, title: 'Beitrag' })], [invoice()], 'Zahlung Rechnung');
    expect(rows[0].invoiceKey).toBe('inv1');
    expect(rows[0].paymentReference).toBe(REF);
    expect(rows[0].title).toBe('Beitrag');
  });
  it('never matches a debit, even with the reference', () => {
    const { rows, matched } = matchInvoicePayments([row(-12000, { paymentReference: REF })], [invoice()], 'x');
    expect(matched).toBe(0);
    expect(rows[0].invoiceKey).toBe('');
  });
  it('skips paid and cancelled invoices and other books', () => {
    for (const patch of [{ state: 'paid' }, { state: 'cancelled' }, { accountingTenantId: 'gss' }]) {
      expect(matchInvoicePayments([row(12000, { paymentReference: REF })], [invoice(patch)], 'x').matched).toBe(0);
    }
  });
  it('leaves posted rows and already linked rows alone', () => {
    const posted = row(12000, { paymentReference: REF, status: 'posted' });
    const linked = row(13000, { paymentReference: REF, invoiceKey: 'other' });
    const { rows, matched } = matchInvoicePayments([posted, linked], [invoice()], 'x');
    expect(matched).toBe(0);
    expect(rows[0]).toBe(posted);
    expect(rows[1].invoiceKey).toBe('other');
  });
  it('ignores invoices without a reference', () => {
    expect(matchInvoicePayments([row(12000, { rawText: '0'.repeat(27) })], [invoice({ paymentReference: '' })], 'x').matched).toBe(0);
  });
  it('tolerates legacy rows whose paymentReference/invoiceKey are undefined', () => {
    const legacy = row(12000, { rawText: `Gutschrift ${spaced}` });
    delete (legacy as Partial<BankImportRowModel>).paymentReference;
    delete (legacy as Partial<BankImportRowModel>).invoiceKey;
    const { rows, matched } = matchInvoicePayments([legacy], [invoice()], 'Zahlung Rechnung');
    expect(matched).toBe(1);
    expect(rows[0].invoiceKey).toBe('inv1');
  });
});
