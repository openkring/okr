import { describe, expect, it } from 'vitest';

import {
  applyBillPayment, billAfterPaymentRemoval, billLinkBlockers, BillLike, billPaymentBlockers, billPaymentBookingLines, billPaymentNote, invoiceAfterPaymentRemoval,
  isPayableBill, issueBookingBillKey, linkedPaymentKeys, openBillAmount, withNoteLine, withoutNoteLine,
} from './bill-payment.logic';

const bill = (o: Partial<BillLike> = {}): BillLike => ({ state: 'todo', totalAmount: { amount: 3900 }, payments: [], accountingTenantId: 'scs', billDate: '20260901', ...o });
const pay = (date: string, amount: number, bookingKey: string) => ({ date, amount, type: 'MANUAL', bookingKey });
const posted = { status: 'posted', accountingTenantId: 'scs' };
const debit = (accountKey: string, amount: number) => ({ accountKey, debitAmount: { amount } });

describe('bill payment rules', () => {
  it('todo and overdue take a payment; draft and paid do not', () => {
    expect(isPayableBill('todo')).toBe(true);
    expect(isPayableBill('overdue')).toBe(true);
    expect(isPayableBill('draft')).toBe(false);
    expect(isPayableBill('paid')).toBe(false);
    expect(isPayableBill(undefined)).toBe(false);
  });

  it('open amount = total − payments, never negative; a legacy doc without payments counts as unpaid', () => {
    expect(openBillAmount(bill({ payments: [pay('20260903', 1000, 'a')] }))).toBe(2900);
    expect(openBillAmount(bill({ payments: [pay('20260903', 5000, 'a')] }))).toBe(0);
    expect(openBillAmount({ state: 'todo', totalAmount: { amount: 3900 }, accountingTenantId: 'scs' })).toBe(3900);
  });

  it('refuses a payment on a closed bill, a bad amount, overpayment and a missing date', () => {
    expect(billPaymentBlockers(bill({ state: 'paid' }), 100, '20260903')).toContain('not-payable');
    expect(billPaymentBlockers(bill(), 0, '20260903')).toContain('invalid-amount');
    expect(billPaymentBlockers(bill(), 10.5, '20260903')).toContain('invalid-amount');
    expect(billPaymentBlockers(bill(), 3901, '20260903')).toContain('overpayment');
    expect(billPaymentBlockers(bill(), 3900, '')).toContain('no-payment-date');
    expect(billPaymentBlockers(bill(), 3900, '20260903')).toEqual([]);
  });

  it('a partial payment keeps the state, the completing one sets paid and the payment date', () => {
    const a = applyBillPayment(bill(), { date: '20260903', amount: 1000, bookingKey: 'b1' });
    expect(a.state).toBe('todo');
    expect(a.paymentDate).toBeUndefined();
    expect(a.payments).toEqual([{ date: '20260903', amount: 1000, type: 'MANUAL', bookingKey: 'b1' }]);
    const b = applyBillPayment(bill({ payments: a.payments }), { date: '20260910', amount: 2900, bookingKey: 'b2', bankAccountKey: 'scs0077' });
    expect(b.state).toBe('paid');
    expect(b.paymentDate).toBe('20260910');
    expect(b.payments[1]).toEqual({ date: '20260910', amount: 2900, type: 'MANUAL', bookingKey: 'b2', bankAccountKey: 'scs0077' });
  });

  it('keeps the type of migrated payments', () => {
    const a = applyBillPayment(bill({ totalAmount: { amount: 5000 }, payments: [{ date: '20260901', amount: 1000, type: 'RECONCILED', bookingKey: 'x' }] }),
      { date: '20260903', amount: 1000, bookingKey: 'b1' });
    expect(a.payments[0].type).toBe('RECONCILED');
  });

  it('payment lines debit the payables account and credit the bank', () => {
    expect(billPaymentBookingLines('scs0121', 'scs0077', 3900)).toEqual([
      { accountKey: 'scs0121', debitAmount: { amount: 3900, currency: 'CHF' } },
      { accountKey: 'scs0077', creditAmount: { amount: 3900, currency: 'CHF' } },
    ]);
  });

  describe('link blockers', () => {
    const lines = [debit('scs0121', 3900), { accountKey: 'scs0077', creditAmount: { amount: 3900 } }];
    const check = (o: { booking?: typeof posted | undefined; lines?: typeof lines; amount?: number; linked?: string[]; key?: string } = {}) =>
      billLinkBlockers('booking' in o ? o.booking : posted, o.lines ?? lines, 'scs0121', 'scs', o.amount ?? 3900, o.linked ?? [], o.key ?? '12040');

    it('accepts the DSL 09 case', () => expect(check()).toEqual([]));
    it('refuses a missing booking', () => expect(check({ booking: undefined })).toEqual(['booking-not-found']));
    it('refuses okr-written bill and invoice bookings', () => {
      expect(check({ key: 'bill-abc-pay-1' })).toContain('own-booking');
      expect(check({ key: 'invoice-abc' })).toContain('own-booking');
    });
    it('refuses archived, unposted and foreign bookings', () => {
      expect(billLinkBlockers({ ...posted, isArchived: true }, lines, 'scs0121', 'scs', 3900, [], 'k')).toContain('booking-archived');
      expect(billLinkBlockers({ ...posted, status: 'cancelled' }, lines, 'scs0121', 'scs', 3900, [], 'k')).toContain('booking-not-posted');
      expect(billLinkBlockers({ ...posted, accountingTenantId: 'gss' }, lines, 'scs0121', 'scs', 3900, [], 'k')).toContain('foreign-booking');
    });
    it('refuses a booking whose payables debit does not cover the amount (a credit does not count)', () => {
      expect(check({ amount: 4000 })).toContain('no-payables-debit');
      expect(check({ lines: [{ accountKey: 'scs0121', creditAmount: { amount: 3900 } }] as never })).toContain('no-payables-debit');
      expect(check({ lines: [{ ...debit('scs0121', 3900), isArchived: true }] as never })).toContain('no-payables-debit');
    });
    it('refuses a booking already linked on any bill', () => expect(check({ linked: ['12040'] })).toContain('already-linked'));
  });

  it('collects every linked payment booking key of a list of bills', () => {
    expect(linkedPaymentKeys([
      { payments: [pay('1', 1, 'a'), { date: '1', amount: 1, type: 'X' }] }, {}, { payments: [pay('1', 1, 'b')] },
    ] as never)).toEqual(['a', 'b']);
  });

  describe('payment removal (writeBooking delete clean-up)', () => {
    it('returns undefined when the bill does not carry the booking', () =>
      expect(billAfterPaymentRemoval(bill({ payments: [pay('20260903', 3900, 'a')] }), 'z')).toBeUndefined());

    it('removes one of two payments and reopens a paid bill', () => {
      const b = bill({ state: 'paid', payments: [pay('20260903', 1000, 'a'), pay('20260910', 2900, 'b')] });
      expect(billAfterPaymentRemoval(b, 'b')).toEqual({ payments: [pay('20260903', 1000, 'a')], state: 'todo', paymentDate: '20260903' });
    });

    it('a bill without payments left has no payment date', () =>
      expect(billAfterPaymentRemoval(bill({ state: 'paid', payments: [pay('20260903', 3900, 'a')] }), 'a'))
        .toEqual({ payments: [], state: 'todo', paymentDate: '' }));

    it('a bill that stays fully paid keeps paid', () => {
      const b = bill({ state: 'paid', payments: [pay('20260903', 3900, 'a'), pay('20260904', 100, 'b')] });
      expect(billAfterPaymentRemoval(b, 'b')?.state).toBe('paid');
    });

    it('a native invoice falls back to pending, a migrated one to partial or unpaid', () => {
      const p = (k: string, amount: number, date = '20260903') => ({ date, amount, bankAccountKey: 'scs0077', bookingKey: k });
      const native = { state: 'paid', bookingKey: 'invoice-k', totalAmount: { amount: 5000 }, payments: [p('a', 5000)] };
      expect(invoiceAfterPaymentRemoval(native, 'a')).toEqual({ payments: [], state: 'pending', paymentDate: '' });
      const migrated = { state: 'paid', bookingKey: '', totalAmount: { amount: 5000 }, payments: [p('a', 2000), p('b', 3000, '20260910')] };
      expect(invoiceAfterPaymentRemoval(migrated, 'b')).toEqual({ payments: [p('a', 2000)], state: 'partial', paymentDate: '20260903' });
      expect(invoiceAfterPaymentRemoval({ ...migrated, state: 'partial', payments: [p('a', 2000)] }, 'a'))
        .toEqual({ payments: [], state: 'unpaid', paymentDate: '' });
      expect(invoiceAfterPaymentRemoval(native, 'z')).toBeUndefined();
    });

    it('a reminder fee keeps an invoice open after removal', () => {
      const inv = { state: 'paid', bookingKey: 'invoice-k', totalAmount: { amount: 5000 }, reminders: [{ fee: 2000 }],
        payments: [{ date: '1', amount: 5000, bankAccountKey: 'b', bookingKey: 'a' }, { date: '2', amount: 2000, bankAccountKey: 'b', bookingKey: 'c' }] };
      expect(invoiceAfterPaymentRemoval(inv, 'c')?.state).toBe('pending');
    });
  });

  it('reads the bill key of an issue booking, not of a payment booking', () => {
    expect(issueBookingBillKey('bill-AbC123')).toBe('AbC123');
    expect(issueBookingBillKey('bill-AbC123-pay-xyz')).toBeUndefined();
    expect(issueBookingBillKey('12040')).toBeUndefined();
    expect(issueBookingBillKey('bill-')).toBeUndefined();
  });
});

describe('booking note of a linked payment', () => {
  it('adds the marker line once and removes it again', () => {
    const line = billPaymentNote('00986', 'DSL 09');
    expect(line).toBe('Zahlung Kreditor 00986 DSL 09 [bill-payment]');
    const once = withNoteLine('BA DSL', line, 500);
    expect(once).toBe('BA DSL\nZahlung Kreditor 00986 DSL 09 [bill-payment]');
    expect(withNoteLine(once, line, 500)).toBe(once);
    expect(withNoteLine('', line, 500)).toBe(line);
    expect(withoutNoteLine(once, line)).toBe('BA DSL');
  });
});
