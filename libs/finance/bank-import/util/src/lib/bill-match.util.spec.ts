import { describe, expect, it } from 'vitest';

import { BankImportRowModel, BillModel } from '@okr/shared-models';

import { matchBillPayments } from './bill-match.util';

const row = (o: Partial<BankImportRowModel> = {}): BankImportRowModel => ({
  ...new BankImportRowModel('scs'), okey: 'r1', accountingTenantId: 'scs', status: 'unmapped',
  amount: { amount: -3900, currency: 'CHF', periodicity: 'one-time' }, rawText: 'LASTSCHRIFT IWAY AG ZUERICH DSL', payee: '', ...o,
} as BankImportRowModel);
const bill = (o: Partial<BillModel> = {}): BillModel => Object.assign(new BillModel('scs'), {
  okey: 'b1', accountingTenantId: 'scs', state: 'todo', billId: '00986', billDate: '20260901',
  totalAmount: { amount: 3900, currency: 'CHF', periodicity: 'one-time' }, payments: [],
  vendor: { key: 'v', name1: '', name2: 'iWay AG', label: 'iWay AG', modelType: 'org', type: '', subType: '' }, ...o,
});
const opts = { titlePrefix: 'Zahlung Kreditor', payablesAccountKey: 'scs0121' };

describe('matchBillPayments', () => {
  it('links a debit to the open bill of the named vendor with exactly the open amount', () => {
    const { rows, matched } = matchBillPayments([row()], [bill()], opts);
    expect(matched).toBe(1);
    expect(rows[0]).toMatchObject({ billKey: 'b1', accountKey: 'scs0121', title: 'Zahlung Kreditor 00986 iWay AG', status: 'mapped', ruleKey: '', vatCodeKey: '' });
  });

  it('prefers the QR reference, whatever the text says', () => {
    const ref = '210000000003139471430009017';
    const { rows } = matchBillPayments([row({ paymentReference: ref, rawText: 'something else' })], [bill({ okey: 'b2', paymentReference: ref }), bill()], opts);
    expect(rows[0].billKey).toBe('b2');
  });

  it('does not match credits, posted rows, rows linked to an invoice and manual assignments', () => {
    expect(matchBillPayments([row({ amount: { amount: 3900, currency: 'CHF', periodicity: 'one-time' } })], [bill()], opts).matched).toBe(0);
    expect(matchBillPayments([row({ status: 'posted' })], [bill()], opts).matched).toBe(0);
    expect(matchBillPayments([row({ invoiceKey: 'i1' })], [bill()], opts).matched).toBe(0);
    expect(matchBillPayments([row({ ruleKey: '', accountKey: 'scs0238' })], [bill()], opts).matched).toBe(0);
  });

  it('a rule assignment is overridden by the match', () =>
    expect(matchBillPayments([row({ ruleKey: 'rule1', accountKey: 'scs0238', status: 'mapped' })], [bill()], opts).rows[0].accountKey).toBe('scs0121'));

  it('refuses an ambiguous match: two open bills of the vendor with the same amount', () =>
    expect(matchBillPayments([row()], [bill(), bill({ okey: 'b2', billId: '00999' })], opts).matched).toBe(0));

  it('ignores paid bills, bills of other books, other amounts and vendors not in the text', () => {
    expect(matchBillPayments([row()], [bill({ state: 'paid' })], opts).matched).toBe(0);
    expect(matchBillPayments([row()], [bill({ accountingTenantId: 'gss' })], opts).matched).toBe(0);
    expect(matchBillPayments([row({ amount: { amount: -3901, currency: 'CHF', periodicity: 'one-time' } })], [bill()], opts).matched).toBe(0);
    expect(matchBillPayments([row({ rawText: 'LASTSCHRIFT SWISSCOM' })], [bill()], opts).matched).toBe(0);
  });

  it('uses each bill once', () => {
    const { rows, matched } = matchBillPayments([row(), row({ okey: 'r2' })], [bill()], opts);
    expect(matched).toBe(1);
    expect(rows[1].billKey ?? '').toBe('');
  });

  it('does not offer a bill another row already claims', () => {
    const { rows, matched } = matchBillPayments([row({ okey: 'r0', billKey: 'b1', status: 'mapped' }), row()], [bill()], opts);
    expect(matched).toBe(0);
    expect(rows[1].billKey ?? '').toBe('');
  });

  it('matches the open rest of a partly paid bill; a legacy bill without payments is fully open', () => {
    const partly = bill({ payments: [{ date: '1', amount: 900, type: 'MANUAL', bookingKey: 'a' }] });
    expect(matchBillPayments([row({ amount: { amount: -3000, currency: 'CHF', periodicity: 'one-time' } })], [partly], opts).matched).toBe(1);
    const legacy = bill();
    delete (legacy as Partial<BillModel>).payments;
    expect(matchBillPayments([row()], [legacy], opts).matched).toBe(1);
  });

  it('without a payables account it links but keeps the assignment', () => {
    const { rows } = matchBillPayments([row({ ruleKey: 'rule1', accountKey: 'scs0238', status: 'mapped' })], [bill()], { ...opts, payablesAccountKey: '' });
    expect(rows[0]).toMatchObject({ billKey: 'b1', accountKey: 'scs0238' });
  });
});
