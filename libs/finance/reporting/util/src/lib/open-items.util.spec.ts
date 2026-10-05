import { describe, expect, it } from 'vitest';

import { BillModel, BookingLineModel, BookingModel, InvoiceModel, MoneyModel } from '@okr/shared-models';

import {
  billClaimsBooking, billOpenAmountAt, computeOpenItems, invoiceClaimsBooking, invoiceOpenAmountAt, OpenItemsResult,
} from './open-items.util';

const PAYABLES = 'acc-2000';
const RECEIVABLES = 'acc-1100';
const BANK = 'acc-1020';
const EXPENSE = 'acc-6000';
const REVENUE = 'acc-3000';

function chf(amount: number): MoneyModel {
  return { amount, currency: 'CHF', periodicity: 'one-time' } as MoneyModel;
}

function bill(okey: string, date: string, total: number, state: BillModel['state'] = 'todo'): BillModel {
  const b = new BillModel('scs');
  b.okey = okey;
  b.billDate = date;
  b.state = state;
  b.totalAmount = chf(total);
  b.payments = [];
  b.bookingKeys = [];
  return b;
}

function invoice(okey: string, date: string, total: number, state = 'pending'): InvoiceModel {
  const i = new InvoiceModel('scs');
  i.okey = okey;
  i.invoiceDate = date;
  i.state = state;
  i.totalAmount = chf(total);
  i.payments = [];
  i.reminders = [];
  i.bookingKeys = [];
  return i;
}

function booking(okey: string, date: string, status: BookingModel['status'] = 'posted', bookingNo = 1): BookingModel {
  const b = new BookingModel('scs', 'scs');
  b.okey = okey;
  b.date = date;
  b.status = status;
  b.bookingNo = bookingNo;
  b.title = okey;
  return b;
}

function line(bookingKey: string, accountKey: string, debit: number, credit: number): BookingLineModel {
  const l = new BookingLineModel('scs', 'scs');
  l.bookingKey = bookingKey;
  l.accountKey = accountKey;
  l.debitAmount = debit ? chf(debit) : undefined;
  l.creditAmount = credit ? chf(credit) : undefined;
  return l;
}

/** a two-line booking: debit `debitAccount`, credit `creditAccount` */
function entry(okey: string, date: string, debitAccount: string, creditAccount: string, amount: number) {
  return { booking: booking(okey, date), lines: [line(okey, debitAccount, amount, 0), line(okey, creditAccount, 0, amount)] };
}

function payables(input: { bills?: BillModel[]; entries?: ReturnType<typeof entry>[]; cutoff?: string; start?: string; accountKey?: string }): OpenItemsResult {
  const entries = input.entries ?? [];
  return computeOpenItems({
    side: 'payables', accountKey: input.accountKey ?? PAYABLES, cutoff: input.cutoff ?? '20261005', start: input.start ?? '20260101',
    bills: input.bills ?? [], invoices: [], bookings: entries.map((e) => e.booking), lines: entries.flatMap((e) => e.lines),
  });
}

function receivables(input: { invoices?: InvoiceModel[]; entries?: ReturnType<typeof entry>[]; cutoff?: string; start?: string }): OpenItemsResult {
  const entries = input.entries ?? [];
  return computeOpenItems({
    side: 'receivables', accountKey: RECEIVABLES, cutoff: input.cutoff ?? '20261005', start: input.start ?? '20260101',
    bills: [], invoices: input.invoices ?? [], bookings: entries.map((e) => e.booking), lines: entries.flatMap((e) => e.lines),
  });
}

/** the reconciliation identity every result must satisfy */
function explained(r: OpenItemsResult): number {
  const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  return sum(r.unclaimedPayments) + r.openWithoutBooking.reduce((s, d) => s + d.openAmount, 0) - sum(r.unclaimedCharges) + r.carriedForward;
}

describe('billOpenAmountAt', () => {
  it('subtracts only the payments dated on or before the cut-off', () => {
    const b = bill('b1', '20260901', 10000);
    b.payments = [{ date: '20260910', amount: 4000, type: 'MANUAL' }, { date: '20261010', amount: 6000, type: 'MANUAL' }];
    expect(billOpenAmountAt(b, '20260930')).toBe(6000);
    expect(billOpenAmountAt(b, '20261031')).toBe(0);
  });
  it('counts a paid bill without payments as paid on its payment date (migrated bexio bill)', () => {
    const b = bill('b1', '20260101', 10000, 'paid');
    b.paymentDate = '20260301';
    expect(billOpenAmountAt(b, '20260201')).toBe(10000);
    expect(billOpenAmountAt(b, '20260301')).toBe(0);
  });
  it('counts a paid bill without payments and without payment date as paid', () => {
    expect(billOpenAmountAt(bill('b1', '20260101', 10000, 'paid'), '20260201')).toBe(0);
  });
  it('is 0 for a draft bill and for one dated after the cut-off', () => {
    expect(billOpenAmountAt(bill('b1', '20260101', 10000, 'draft'), '20261005')).toBe(0);
    expect(billOpenAmountAt(bill('b1', '20261101', 10000), '20261005')).toBe(0);
  });
});

describe('invoiceOpenAmountAt', () => {
  function reminder(date: string, fee: number, waivedAt = '') {
    return { level: 1, date, dueDate: '', isSent: true, documentKey: '', fee, bookingKey: '', waivedAt, waiveBookingKey: '' };
  }
  it('adds the reminder fees charged by the cut-off', () => {
    const i = invoice('i1', '20260101', 10000);
    i.reminders = [reminder('20260301', 2000)];
    expect(invoiceOpenAmountAt(i, '20260201')).toBe(10000);
    expect(invoiceOpenAmountAt(i, '20260301')).toBe(12000);
  });
  it('still counts a fee waived after the cut-off', () => {
    const i = invoice('i1', '20260101', 10000);
    i.reminders = [reminder('20260301', 2000, '20260401')];
    expect(invoiceOpenAmountAt(i, '20260315')).toBe(12000);
    expect(invoiceOpenAmountAt(i, '20260401')).toBe(10000);
  });
  it('is 0 for draft, issuing and cancelled invoices', () => {
    for (const state of ['draft', 'issuing', 'cancelled']) {
      expect(invoiceOpenAmountAt(invoice('i1', '20260101', 10000, state), '20261005')).toBe(0);
    }
  });
});

describe('claims', () => {
  it('a bill claims its own bookings and payments', () => {
    const b = bill('b1', '20260101', 100);
    b.bookingKeys = ['4711'];
    b.payments = [{ date: '20260201', amount: 100, type: 'MANUAL', bookingKey: 'bank-x-1' }];
    expect(billClaimsBooking(b, '4711')).toBe(true);
    expect(billClaimsBooking(b, 'bank-x-1')).toBe(true);
    expect(billClaimsBooking(b, 'bill-b1')).toBe(true);
    expect(billClaimsBooking(b, 'bill-b1-pay-abc')).toBe(true);
    expect(billClaimsBooking(b, 'bill-b10')).toBe(false);
  });
  it('an invoice does not claim the bookings of an invoice whose key it prefixes', () => {
    const i = invoice('ab', '20260101', 100);
    expect(invoiceClaimsBooking(i, 'invoice-ab')).toBe(true);
    expect(invoiceClaimsBooking(i, 'invoice-ab-pay-1')).toBe(true);
    expect(invoiceClaimsBooking(i, 'invoice-abc')).toBe(false);
    expect(invoiceClaimsBooking(i, 'invoice-abc-pay-1')).toBe(false);
  });
  it('an invoice claims linked payments, migrated bookings and reminder fee bookings', () => {
    const i = invoice('i1', '20260101', 100);
    i.bookingKeys = ['900'];
    i.payments = [{ date: '20260201', amount: 100, bankAccountKey: BANK, bookingKey: 'bank-y-2' }];
    i.reminders = [{ level: 1, date: '', dueDate: '', isSent: true, documentKey: '', fee: 0, bookingKey: 'r-1', waivedAt: '', waiveBookingKey: 'w-1' }];
    for (const key of ['900', 'bank-y-2', 'r-1', 'w-1']) expect(invoiceClaimsBooking(i, key)).toBe(true);
    expect(invoiceClaimsBooking(i, 'other')).toBe(false);
  });
});

describe('computeOpenItems — payables', () => {
  it('reconciles a booked, partly paid bill to a difference of 0', () => {
    const b = bill('b1', '20260901', 10000);
    b.bookingKeys = ['bill-b1'];
    b.payments = [{ date: '20260910', amount: 4000, type: 'MANUAL', bookingKey: 'p1' }];
    const r = payables({ bills: [b], entries: [entry('bill-b1', '20260901', EXPENSE, PAYABLES, 10000), entry('p1', '20260910', PAYABLES, BANK, 4000)] });
    expect(r).toMatchObject({ configured: true, openTotal: 6000, balance: 6000, difference: 0, carriedForward: 0 });
    expect(r.documents.map((d) => d.key)).toEqual(['b1']);
    expect(r.unclaimedPayments).toEqual([]);
    expect(r.unclaimedCharges).toEqual([]);
    expect(r.openWithoutBooking).toEqual([]);
  });

  it('shows a payment booked without linking it (the DSL 09 case)', () => {
    const b = bill('b1', '20260901', 3900);
    b.bookingKeys = ['bill-b1'];
    const r = payables({ bills: [b], entries: [entry('bill-b1', '20260901', EXPENSE, PAYABLES, 3900), entry('12040', '20260903', PAYABLES, BANK, 3900)] });
    expect(r).toMatchObject({ openTotal: 3900, balance: 0, difference: 3900, carriedForward: 0 });
    expect(r.unclaimedPayments).toEqual([{ bookingKey: '12040', bookingNo: 1, date: '20260903', title: '12040', amount: 3900 }]);
    expect(explained(r)).toBe(r.difference);
  });

  it('shows a cost booked over the creditor account without a bill', () => {
    const r = payables({ entries: [entry('k1', '20260505', EXPENSE, PAYABLES, 2500)] });
    expect(r).toMatchObject({ openTotal: 0, balance: 2500, difference: -2500 });
    expect(r.unclaimedCharges.map((x) => [x.bookingKey, x.amount])).toEqual([['k1', 2500]]);
    expect(explained(r)).toBe(r.difference);
  });

  it('shows an open bill whose booking is not on the account (migrated, booked straight to the bank)', () => {
    const b = bill('b1', '20260301', 5000);
    b.bookingKeys = ['m1'];
    const r = payables({ bills: [b], entries: [entry('m1', '20260301', EXPENSE, BANK, 5000)] });
    expect(r.openWithoutBooking.map((d) => [d.key, d.openAmount])).toEqual([['b1', 5000]]);
    expect(r.difference).toBe(5000);
    expect(explained(r)).toBe(r.difference);
  });

  it('keeps a bill open at a cut-off before its payment', () => {
    const b = bill('b1', '20260901', 10000);
    b.bookingKeys = ['bill-b1'];
    b.payments = [{ date: '20261003', amount: 10000, type: 'MANUAL', bookingKey: 'p1' }];
    const entries = [entry('bill-b1', '20260901', EXPENSE, PAYABLES, 10000), entry('p1', '20261003', PAYABLES, BANK, 10000)];
    expect(payables({ bills: [b], entries, cutoff: '20260930' })).toMatchObject({ openTotal: 10000, balance: 10000, difference: 0 });
    expect(payables({ bills: [b], entries, cutoff: '20261005' })).toMatchObject({ openTotal: 0, balance: 0, difference: 0 });
  });

  it('carries everything before the scope start forward as one figure', () => {
    const r = payables({ entries: [entry('old', '20251215', EXPENSE, PAYABLES, 7000), entry('new', '20260215', EXPENSE, PAYABLES, 1000)] });
    expect(r.unclaimedCharges.map((x) => x.bookingKey)).toEqual(['new']);
    expect(r.carriedForward).toBe(-7000);
    expect(explained(r)).toBe(r.difference);
  });

  it('ignores bookings that are not posted, archived or after the cut-off', () => {
    const draft = entry('d', '20260201', EXPENSE, PAYABLES, 100);
    draft.booking.status = 'cancelled';
    const archived = entry('a', '20260201', EXPENSE, PAYABLES, 100);
    archived.booking.isArchived = true;
    const late = entry('l', '20261101', EXPENSE, PAYABLES, 100);
    const r = payables({ entries: [draft, archived, late] });
    expect(r).toMatchObject({ balance: 0, difference: 0 });
    expect(r.unclaimedCharges).toEqual([]);
  });

  it('nets a booking with several lines on the account and skips one that nets to 0', () => {
    const transfer = { booking: booking('t', '20260201'), lines: [line('t', PAYABLES, 500, 0), line('t', PAYABLES, 0, 500)] };
    const r = payables({ entries: [transfer] });
    expect(r.unclaimedPayments).toEqual([]);
    expect(r.unclaimedCharges).toEqual([]);
  });

  it('reports not configured without an account', () => {
    const r = payables({ bills: [bill('b1', '20260101', 100)], accountKey: '' });
    expect(r).toMatchObject({ configured: false, openTotal: 0, balance: 0, difference: 0, carriedForward: 0 });
    expect(r.documents).toEqual([]);
  });
});

describe('computeOpenItems — receivables', () => {
  it('mirrors the signs: issue debits, payment credits the debtor account', () => {
    const i = invoice('i1', '20260901', 10000);
    i.bookingKey = 'invoice-i1';
    const r = receivables({
      invoices: [i],
      entries: [entry('invoice-i1', '20260901', RECEIVABLES, REVENUE, 10000), entry('bank-z-1', '20260915', BANK, RECEIVABLES, 10000)],
    });
    expect(r).toMatchObject({ openTotal: 10000, balance: 0, difference: 10000 });
    expect(r.unclaimedPayments.map((x) => [x.bookingKey, x.amount])).toEqual([['bank-z-1', 10000]]);
    expect(explained(r)).toBe(r.difference);
  });

  it('claims the payment and storno bookings okr writes for the invoice', () => {
    const i = invoice('i1', '20260901', 10000);
    i.bookingKey = 'invoice-i1';
    i.payments = [{ date: '20260915', amount: 10000, bankAccountKey: BANK, bookingKey: 'invoice-i1-pay-xyz' }];
    const r = receivables({
      invoices: [i],
      entries: [entry('invoice-i1', '20260901', RECEIVABLES, REVENUE, 10000), entry('invoice-i1-pay-xyz', '20260915', BANK, RECEIVABLES, 10000)],
    });
    expect(r).toMatchObject({ openTotal: 0, balance: 0, difference: 0, carriedForward: 0 });
    expect(r.documents).toEqual([]);
  });

  it('lists the open documents oldest first with their open amount at the cut-off', () => {
    const a = invoice('a', '20260905', 300);
    const b = invoice('b', '20260901', 200);
    a.bookingKey = 'invoice-a';
    b.bookingKey = 'invoice-b';
    const r = receivables({
      invoices: [a, b],
      entries: [entry('invoice-a', '20260905', RECEIVABLES, REVENUE, 300), entry('invoice-b', '20260901', RECEIVABLES, REVENUE, 200)],
    });
    expect(r.documents.map((d) => [d.kind, d.key, d.openAmount])).toEqual([['invoice', 'b', 200], ['invoice', 'a', 300]]);
    expect(r.difference).toBe(0);
  });
});
