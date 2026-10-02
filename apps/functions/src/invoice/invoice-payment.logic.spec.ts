import { describe, expect, it } from 'vitest';
import { applyInvoicePayment, cancelBlockers, firstDebitAccount, InvoiceLike, isValidPaymentId, linkBlockers, linkDecision, openAmount, paymentBlockers, paymentBookingLines, paymentDecision, reversalLines } from './invoice-payment.logic';

const inv = (o: Partial<InvoiceLike> = {}): InvoiceLike => ({ state: 'pending', totalAmount: { amount: 67550 }, payments: [], accountingTenantId: 'scs', ...o });

describe('invoice payment logic', () => {
  it('open amount = total − payments', () => expect(openAmount(inv({ payments: [{ date: '20261005', amount: 50000, bankAccountKey: 'b', bookingKey: 'x' }] }))).toBe(17550));
  it('refuses overpayment, zero, fractions and non-pending', () => {
    expect(paymentBlockers(inv(), 67551, '20261005')).toContain('overpayment');
    expect(paymentBlockers(inv(), 0, '20261005')).toContain('invalid-amount');
    expect(paymentBlockers(inv(), 10.5, '20261005')).toContain('invalid-amount');
    expect(paymentBlockers(inv({ state: 'paid' }), 100, '20261005')).toContain('not-payable');
    expect(paymentBlockers(inv(), 100, '')).toContain('no-payment-date');
  });
  it('a partial payment stays pending, the completing one sets paid + paymentDate', () => {
    const a = applyInvoicePayment(inv(), { paymentId: 'p1', date: '20261005', amount: 50000, bankAccountKey: 'scs0077', bookingKey: 'invoice-k-pay-0' });
    expect(a.state).toBe('pending'); expect(a.paymentDate).toBeUndefined();
    const b = applyInvoicePayment({ ...inv(), payments: a.payments }, { paymentId: 'p2', date: '20261010', amount: 17550, bankAccountKey: 'scs0077', bookingKey: 'invoice-k-pay-1' });
    expect(b.state).toBe('paid'); expect(b.paymentDate).toBe('20261010'); expect(b.payments).toHaveLength(2);
  });
  it('payment lines debit the bank, credit receivables', () =>
    expect(paymentBookingLines('scs0077', 'scs0093', 17550)).toEqual([
      { accountKey: 'scs0077', debitAmount: { amount: 17550, currency: 'CHF' } },
      { accountKey: 'scs0093', creditAmount: { amount: 17550, currency: 'CHF' } }]));
  it('link refuses foreign, unposted, missing receivables credit and double links', () => {
    const lines = [{ accountKey: 'scs0077' }, { accountKey: 'scs0093', creditAmount: { amount: 67550 } }];
    expect(linkBlockers(undefined, [], 'scs0093', 'scs', 100, [], 'b1')).toContain('booking-not-found');
    expect(linkBlockers({ status: 'forReview', accountingTenantId: 'scs' }, lines, 'scs0093', 'scs', 100, [], 'b1')).toContain('booking-not-posted');
    expect(linkBlockers({ status: 'posted', accountingTenantId: 'gss' }, lines, 'scs0093', 'scs', 100, [], 'b1')).toContain('foreign-booking');
    expect(linkBlockers({ status: 'posted', accountingTenantId: 'scs' }, lines, 'scs0093', 'scs', 67551, [], 'b1')).toContain('no-receivables-credit');
    expect(linkBlockers({ status: 'posted', accountingTenantId: 'scs' }, lines, 'scs0093', 'scs', 100, ['b1'], 'b1')).toContain('already-linked');
    expect(linkBlockers({ status: 'posted', accountingTenantId: 'scs' }, lines, 'scs0093', 'scs', 67550, [], 'b1')).toEqual([]);
  });
  it('a retried payment returns the stored one', () => {
    expect(paymentDecision([{ bookingKey: 'invoice-k-pay-0' }], 'invoice-k-pay-0')).toBe('return-stored');
    expect(paymentDecision([], 'invoice-k-pay-0')).toBe('write');
  });
  it('cancel refuses payments and migrated invoices', () => {
    expect(cancelBlockers({ ...inv(), bookingKey: 'invoice-k', payments: [{ date: 'd', amount: 1, bankAccountKey: 'b', bookingKey: 'x' }] }, 'k', true)).toContain('has-payments');
    expect(cancelBlockers({ ...inv(), bookingKey: '' }, 'k', false)).toContain('no-issue-booking');
    expect(cancelBlockers({ ...inv(), state: 'paid', bookingKey: 'invoice-k' }, 'k', true)).toContain('not-cancellable');
    expect(cancelBlockers({ ...inv(), bookingKey: 'invoice-k' }, 'k', true)).toEqual([]);
  });
  it('reversal swaps debit and credit and keeps other fields', () =>
    expect(reversalLines([{ accountKey: 'a', debitAmount: { amount: 5 }, costCenterKey: 'cc' }])).toEqual([{ accountKey: 'a', creditAmount: { amount: 5 }, costCenterKey: 'cc' }]));
  it('refuses negative, NaN and Infinity amounts', () => {
    for (const a of [-5, Number.NaN, Number.POSITIVE_INFINITY]) expect(paymentBlockers(inv(), a, '20261005')).toContain('invalid-amount');
  });
  it('overpayment is measured against the open amount of a partially paid invoice', () => {
    const partial = inv({ payments: [{ date: '20261005', amount: 50000, bankAccountKey: 'b', bookingKey: 'x' }] });
    expect(paymentBlockers(partial, 17551, '20261010')).toContain('overpayment');
    expect(paymentBlockers(partial, 17550, '20261010')).toEqual([]);
  });
  it('cancel refuses an invoice whose booking key is not its own', () =>
    expect(cancelBlockers({ ...inv(), bookingKey: 'other' }, 'k', true)).toContain('no-issue-booking'));
  it('reversal treats null like absent', () =>
    expect(reversalLines([{ accountKey: 'a', debitAmount: { amount: 5 }, creditAmount: null }])).toEqual([{ accountKey: 'a', creditAmount: { amount: 5 } }]));
  it('payment ids are 8-32 alphanumerics', () => {
    expect(isValidPaymentId('abcDEF12')).toBe(true);
    expect(isValidPaymentId('a'.repeat(32))).toBe(true);
    for (const id of ['short', 'a'.repeat(33), 'abc-defg1', 'abc defg1', '', undefined, 12345678]) expect(isValidPaymentId(id)).toBe(false);
  });
  it('a link retry with the same booking, amount and date returns the stored payment', () => {
    const payments = [{ date: '20261005', amount: 100, bookingKey: 'b1' }];
    expect(linkDecision(payments, 'b1', 100, '20261005')).toBe('return-stored');
    expect(linkDecision(payments, 'b1', 101, '20261005')).toBe('write');
    expect(linkDecision(payments, 'b1', 100, '20261006')).toBe('write');
    expect(linkDecision(payments, 'b2', 100, '20261005')).toBe('write');
  });
  it('the bank account of a linked booking is its first debit line', () => {
    expect(firstDebitAccount([{ accountKey: 'r', creditAmount: { amount: 5 } }, { accountKey: 'bank', debitAmount: { amount: 5 } }, { accountKey: 'x', debitAmount: { amount: 1 } }])).toBe('bank');
    expect(firstDebitAccount([{ accountKey: 'r', creditAmount: { amount: 5 } }])).toBe('');
  });
});
