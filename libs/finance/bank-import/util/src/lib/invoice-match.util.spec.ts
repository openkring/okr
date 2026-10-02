import { describe, expect, it } from 'vitest';

import { BankImportRowModel, InvoiceModel, MoneyModel } from '@okr/shared-models';
import { generateQrReference } from '@okr/shared-util-core';

import { matchInvoicePayments, unsettledReasonKey } from './invoice-match.util';

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
    const { rows, matched } = matchInvoicePayments([row(12000, { paymentReference: REF })], [invoice()], { titlePrefix: 'Zahlung Rechnung', receivablesAccountKey: '' });
    expect(matched).toBe(1);
    expect(rows[0].invoiceKey).toBe('inv1');
    expect(rows[0].title).toBe('Zahlung Rechnung 202600042 Hans Muster');
  });
  it('finds a spaced reference in CSV text; the invoice title wins over a rule title', () => {
    const { rows } = matchInvoicePayments([row(12000, { rawText: `Gutschrift ${spaced}`, title: 'Beitrag' })], [invoice()], { titlePrefix: 'Zahlung Rechnung', receivablesAccountKey: '' });
    expect(rows[0].invoiceKey).toBe('inv1');
    expect(rows[0].paymentReference).toBe(REF);
    expect(rows[0].title).toBe('Zahlung Rechnung 202600042 Hans Muster');
  });
  it('never matches a debit, even with the reference', () => {
    const { rows, matched } = matchInvoicePayments([row(-12000, { paymentReference: REF })], [invoice()], { titlePrefix: 'x', receivablesAccountKey: '' });
    expect(matched).toBe(0);
    expect(rows[0].invoiceKey).toBe('');
  });
  it('skips paid and cancelled invoices and other books', () => {
    for (const patch of [{ state: 'paid' }, { state: 'cancelled' }, { accountingTenantId: 'gss' }]) {
      expect(matchInvoicePayments([row(12000, { paymentReference: REF })], [invoice(patch)], { titlePrefix: 'x', receivablesAccountKey: '' }).matched).toBe(0);
    }
  });
  it('leaves posted rows and already linked rows alone', () => {
    const posted = row(12000, { paymentReference: REF, status: 'posted' });
    const linked = row(13000, { paymentReference: REF, invoiceKey: 'other' });
    const { rows, matched } = matchInvoicePayments([posted, linked], [invoice()], { titlePrefix: 'x', receivablesAccountKey: '' });
    expect(matched).toBe(0);
    expect(rows[0]).toBe(posted);
    expect(rows[1].invoiceKey).toBe('other');
  });
  it('ignores invoices without a reference', () => {
    expect(matchInvoicePayments([row(12000, { rawText: '0'.repeat(27) })], [invoice({ paymentReference: '' })], { titlePrefix: 'x', receivablesAccountKey: '' }).matched).toBe(0);
  });
  it('tolerates legacy rows whose paymentReference/invoiceKey are undefined', () => {
    const legacy = row(12000, { rawText: `Gutschrift ${spaced}` });
    delete (legacy as Partial<BankImportRowModel>).paymentReference;
    delete (legacy as Partial<BankImportRowModel>).invoiceKey;
    const { rows, matched } = matchInvoicePayments([legacy], [invoice()], { titlePrefix: 'Zahlung Rechnung', receivablesAccountKey: '' });
    expect(matched).toBe(1);
    expect(rows[0].invoiceKey).toBe('inv1');
  });
  it('assigns the receivables account and maps the row, overriding a rule', () => {
    const r = row(12000, { paymentReference: REF, ruleKey: 'rule1', accountKey: 'scs-3000', title: 'Beitrag', vatCodeKey: 'v1', status: 'mapped' });
    const { rows } = matchInvoicePayments([r], [invoice()], { titlePrefix: 'Zahlung Rechnung', receivablesAccountKey: 'scs-1100' });
    expect(rows[0]).toMatchObject({ invoiceKey: 'inv1', accountKey: 'scs-1100', vatCodeKey: '', ruleKey: '', status: 'mapped', title: 'Zahlung Rechnung 202600042 Hans Muster' });
  });
  it('never touches a manual assignment', () => {
    const r = row(12000, { paymentReference: REF, ruleKey: '', accountKey: 'scs-3000' });
    expect(matchInvoicePayments([r], [invoice()], { titlePrefix: 'x', receivablesAccountKey: 'scs-1100' }).matched).toBe(0);
  });
  it('refuses an ambiguous reference', () => {
    const { matched } = matchInvoicePayments([row(12000, { paymentReference: REF })], [invoice(), invoice({ okey: 'inv2' })], { titlePrefix: 'x', receivablesAccountKey: 'scs-1100' });
    expect(matched).toBe(0);
  });
  it('without a receivables account only links', () => {
    const { rows } = matchInvoicePayments([row(12000, { paymentReference: REF })], [invoice()], { titlePrefix: 'x', receivablesAccountKey: '' });
    expect(rows[0].invoiceKey).toBe('inv1');
    expect(rows[0].accountKey).toBe('');
  });
  it('prefers the camt reference over one found in the text', () => {
    const other = generateQrReference(202600099);
    const { rows } = matchInvoicePayments([row(12000, { paymentReference: REF, rawText: `Ref ${other}` })], [invoice(), invoice({ okey: 'inv9', paymentReference: other })], { titlePrefix: 'x', receivablesAccountKey: '' });
    expect(rows[0].invoiceKey).toBe('inv1');
  });
  it('skips a row without amount', () => {
    const r = row(12000, { paymentReference: REF }); delete (r as Partial<BankImportRowModel>).amount;
    expect(matchInvoicePayments([r], [invoice()], { titlePrefix: 'x', receivablesAccountKey: '' }).matched).toBe(0);
  });
});

describe('unsettledReasonKey (postBankImport skip reason → i18n key)', () => {
  it('names what the treasurer can act on', () => {
    expect(unsettledReasonKey('overpayment')).toBe('post_unsettled_overpayment');
    expect(unsettledReasonKey('not-payable')).toBe('post_unsettled_not_payable');
    expect(unsettledReasonKey('no-receivables-credit')).toBe('post_unsettled_no_receivables_credit');
  });
  it('an already paid invoice (not-payable + overpayment) reads as paid or cancelled', () => {
    expect(unsettledReasonKey('not-payable,overpayment')).toBe('post_unsettled_not_payable');
  });
  it('everything else falls back to the general text', () => {
    for (const r of ['missing', 'other-tenant', 'other-books', 'bexio-backend', 'already-recorded', 'not-a-chf-credit', 'no-receivables-account', 'invalid-amount', '']) {
      expect(unsettledReasonKey(r)).toBe('post_unsettled_other');
    }
  });
});
