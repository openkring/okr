import { describe, expect, it } from 'vitest';

import { BillModel } from '@okr/shared-models';

import {
  billPaymentCandidates, billPaymentHintWindow, billPaymentHints, billPaymentWindow, billRefusalReasons, earliestPaymentFromDate, isPayableBill, isRetryableBillPaymentRefusal,
  linkedBillPaymentKeys, newBillPaymentFormModel, openBillAmount,
} from './bill-payment.util';
import { billPaymentValidations } from './bill-payment.validations';

const bill = (o: Partial<BillModel> = {}): BillModel => Object.assign(new BillModel('scs'), {
  okey: 'b1', state: 'todo', billDate: '20260901', totalAmount: { amount: 3900, currency: 'CHF', periodicity: 'one-time' }, payments: [], ...o,
});
const header = (okey: string, date: string, o: Record<string, unknown> = {}) => ({ okey, bookingNo: 1, date, title: `T ${okey}`, status: 'posted', isArchived: false, ...o });
const line = (bookingKey: string, accountKey: string, debit?: number, credit?: number) => ({
  bookingKey, accountKey, isArchived: false,
  debitAmount: debit ? { amount: debit, currency: 'CHF', periodicity: 'one-time' } : undefined,
  creditAmount: credit ? { amount: credit, currency: 'CHF', periodicity: 'one-time' } : undefined,
}) as never;

describe('bill payment util', () => {
  it('open amount and payable states; a legacy doc without payments counts as unpaid', () => {
    expect(openBillAmount(bill({ payments: [{ date: '1', amount: 1000, type: 'MANUAL' }] }))).toBe(2900);
    expect(openBillAmount({ totalAmount: { amount: 3900 } } as never)).toBe(3900);
    expect(isPayableBill(bill())).toBe(true);
    expect(isPayableBill(bill({ state: 'overdue' }))).toBe(true);
    expect(isPayableBill(bill({ state: 'paid' }))).toBe(false);
    expect(isPayableBill(bill({ state: 'draft' }))).toBe(false);
  });

  it('collects the linked payment booking keys of all bills', () =>
    expect(linkedBillPaymentKeys([bill({ payments: [{ date: '1', amount: 1, type: 'X', bookingKey: 'a' }, { date: '1', amount: 1, type: 'X' }] }), bill()]))
      .toEqual(['a']));

  it('a new form posts the open amount, or links a preselected booking', () => {
    expect(newBillPaymentFormModel(bill(), '20261005', ['scs0077'])).toEqual({
      mode: 'post', date: '20261005', amount: 39, bankAccountKey: 'scs0077', bookingKey: '', openAmount: 39, bookingAmount: 0,
    });
    expect(newBillPaymentFormModel(bill(), '20261005', []).mode).toBe('link');
    const pre = { bookingKey: '12040', bookingNo: 12040, date: '20260903', title: 'BA DSL', debitedAmount: 3900 };
    expect(newBillPaymentFormModel(bill(), '20261005', ['scs0077'], pre)).toMatchObject({ mode: 'link', bookingKey: '12040', date: '20260903', amount: 39, bookingAmount: 39 });
  });

  describe('candidates', () => {
    const lines = [line('12040', 'scs0121', 3900), line('12040', 'scs0077', undefined, 3900), line('x-credit', 'scs0121', undefined, 3900),
      line('other', 'scs0238', 3900), line('old', 'scs0121', 3900), line('draft', 'scs0121', 3900), line('linked', 'scs0121', 3900),
      line('bill-k-pay-1', 'scs0121', 3900)];
    const bookings = [header('12040', '20260903'), header('x-credit', '20260903'), header('other', '20260903'), header('old', '20260701'),
      header('draft', '20260903', { status: 'forReview' }), header('linked', '20260903'), header('bill-k-pay-1', '20260903')];

    it('keeps only posted, unlinked bookings that debit the payables account on or after the start date', () => {
      const c = billPaymentCandidates(lines, bookings as never, 'scs0121', ['linked'], '20260802');
      expect(c.map((x) => x.bookingKey)).toEqual(['12040']);
      expect(c[0]).toEqual({ bookingKey: '12040', bookingNo: 1, date: '20260903', title: 'T 12040', debitedAmount: 3900 });
    });
    it('returns nothing without a payables account', () => expect(billPaymentCandidates(lines, bookings as never, '', [])).toEqual([]));
  });

  describe('hints', () => {
    const c = (bookingKey: string, date: string, debitedAmount: number) => ({ bookingKey, bookingNo: 1, date, title: '', debitedAmount });

    it('finds the booking with exactly the open amount (the DSL 09 case)', () =>
      expect(billPaymentHints([bill()], [c('12039', '20260903', 5230), c('12040', '20260903', 3900)])).toEqual(new Map([['b1', '12040']])));

    it('uses each booking once, oldest bill first', () => {
      const hints = billPaymentHints([bill({ okey: 'b2', billDate: '20260905' }), bill({ okey: 'b1' })], [c('p1', '20260903', 3900)]);
      expect([...hints]).toEqual([['b1', 'p1']]);
    });

    it('ignores paid bills, other amounts and bookings before the look-back', () => {
      expect(billPaymentHints([bill({ state: 'paid' })], [c('p1', '20260903', 3900)]).size).toBe(0);
      expect(billPaymentHints([bill()], [c('p1', '20260903', 3901)]).size).toBe(0);
      expect(billPaymentHints([bill()], [c('p1', '20260701', 3900)]).size).toBe(0);
    });

    it('matches the open rest of a partly paid bill', () =>
      expect(billPaymentHints([bill({ payments: [{ date: '1', amount: 900, type: 'MANUAL', bookingKey: 'a' }] })], [c('p1', '20260910', 3000)]).get('b1')).toBe('p1'));
  });

  it('the window of a bill: look-back before the bill date, look-ahead after the due date, never past today', () => {
    expect(billPaymentWindow(bill({ dueDate: '20261001' }), '20261005')).toEqual({ from: '20260802', to: '20261005' });
    expect(billPaymentWindow(bill({ dueDate: '20261001' }), '20271231')).toEqual({ from: '20260802', to: '20270330' });
    expect(billPaymentWindow(bill({ billDate: '' }), '20261005')).toBeUndefined();
  });

  it('hints only look at open bills of the last year', () => {
    const w = billPaymentHintWindow([bill({ okey: 'old', billDate: '20200101' }), bill()], '20261005');
    expect(w?.bills.map((b) => b.okey)).toEqual(['b1']);
    expect(w).toMatchObject({ from: '20260802', to: '20261005' });
    expect(billPaymentHintWindow([bill({ billDate: '20200101' })], '20261005')).toBeUndefined();
  });

  it('the earliest start date of several bills', () => {
    expect(earliestPaymentFromDate([bill({ billDate: '20260915' }), bill({ billDate: '20260901' }), bill({ billDate: '' })])).toBe('20260802');
    expect(earliestPaymentFromDate([])).toBe('');
  });

  it('reads refusal reasons and decides whether to retry', () => {
    expect(billRefusalReasons({ details: { reason: 'link-blocked', reasons: ['already-linked'] } })).toEqual(['already-linked']);
    expect(billRefusalReasons({ details: { reason: 'no-payables-account' } })).toEqual(['no-payables-account']);
    expect(billRefusalReasons({ code: 'functions/not-found' })).toEqual(['not-found']);
    expect(billRefusalReasons(new Error('network'))).toEqual([]);
    expect(isRetryableBillPaymentRefusal(['overpayment'])).toBe(true);
    expect(isRetryableBillPaymentRefusal([])).toBe(true);
    expect(isRetryableBillPaymentRefusal(['no-payables-account'])).toBe(false);
  });

  describe('validations', () => {
    const model = newBillPaymentFormModel(bill(), '20261005', ['scs0077']);
    it('accepts the prefilled form', () => expect(billPaymentValidations(model).isValid()).toBe(true));
    it('refuses more than is open and zero', () => {
      expect(billPaymentValidations({ ...model, amount: 39.01 }).getErrors('amount').length).toBeGreaterThan(0);
      expect(billPaymentValidations({ ...model, amount: 0 }).getErrors('amount').length).toBeGreaterThan(0);
    });
    it('link mode needs a booking that covers the amount', () => {
      expect(billPaymentValidations({ ...model, mode: 'link' }).getErrors('bookingKey').length).toBeGreaterThan(0);
      expect(billPaymentValidations({ ...model, mode: 'link', bookingKey: 'k', bookingAmount: 20 }).getErrors('amount').length).toBeGreaterThan(0);
    });
  });
});
