import { describe, expect, it } from 'vitest';

import { InvoiceModel } from '@okr/shared-models';

import { INVOICE_I18N_KEYS, INVOICE_REFUSAL_I18N, InvoiceI18n, invoiceRefusalKeys, invoiceRefusalText } from './invoice-i18n';
import {
  BOOKING_KEY_CHUNK_SIZE, cancelInputProblem, chunked, draftInvoicesOf, linkableBookings, formatPaymentChf, INVOICE_CANCEL_REASON_LENGTH, InvoicePaymentFormModel, invoicePaymentCandidates,
  isPayableState, isRetryablePaymentRefusal, MAX_PAYMENT_CANDIDATES, newInvoicePaymentFormModel, newPaymentId, openInvoiceAmount,
  InvoicePaymentCandidate, invoicePaymentHints, invoicePaymentHintWindow, linkedInvoicePaymentKeys,
} from './invoice-payment.util';
import { invoicePaymentValidations } from './invoice-payment.validations';
import { invoiceRefusalReasons } from './invoice-position.util';

function invoice(total: number, payments: number[] = [], state = 'pending'): InvoiceModel {
  const i = new InvoiceModel('scs');
  i.okey = 'inv1';
  i.state = state;
  i.invoiceDate = '20260901';
  i.totalAmount = { amount: total, currency: 'CHF', periodicity: 'one-time' } as InvoiceModel['totalAmount'];
  i.payments = payments.map((amount, n) => ({ date: '20260910', amount, bankAccountKey: 'bank', bookingKey: `b${n}` }));
  return i;
}

const i18n = Object.fromEntries(Object.keys(INVOICE_I18N_KEYS).map((k) => [k, () => k])) as unknown as InvoiceI18n;

describe('newPaymentId', () => {
  it('returns 20 letters or digits, as the server requires', () => {
    expect(newPaymentId()).toMatch(/^[A-Za-z0-9]{20}$/);
  });
  it('is random per call', () => {
    expect(newPaymentId()).not.toBe(newPaymentId());
  });
  it('maps the random bytes onto the alphabet', () => {
    expect(newPaymentId((n) => new Uint8Array(n))).toBe('A'.repeat(20));
  });
});

describe('openInvoiceAmount', () => {
  it('is the total minus the payments', () => {
    expect(openInvoiceAmount(invoice(10000, [2500]))).toBe(7500);
  });
  it('adds the reminder fees', () => {
    expect(openInvoiceAmount({ ...invoice(10000, []), reminders: [{ fee: 2000 }, {}] })).toBe(12000);
  });
  it('is never negative', () => {
    expect(openInvoiceAmount(invoice(10000, [6000, 6000]))).toBe(0);
  });
  it('treats missing payments and total as 0', () => {
    expect(openInvoiceAmount({ totalAmount: undefined, payments: undefined as never })).toBe(0);
  });
});

describe('formatPaymentChf', () => {
  it('formats Rappen as CHF with two decimals', () => {
    expect(formatPaymentChf(123450)).toBe('1234.50');
  });
});

describe('newInvoicePaymentFormModel', () => {
  it('posts on the first payment account with the open amount', () => {
    expect(newInvoicePaymentFormModel(invoice(10000, [2500]), '20261002', ['bank', 'post'])).toEqual({
      mode: 'post', date: '20261002', amount: 75, bankAccountKey: 'bank', bookingKey: '', openAmount: 75, bookingAmount: 0,
    });
  });
  it('links when no payment account is configured', () => {
    const f = newInvoicePaymentFormModel(invoice(10000), '20261002', []);
    expect(f.mode).toBe('link');
    expect(f.bankAccountKey).toBe('');
  });
});

describe('invoicePaymentCandidates', () => {
  const credit = (bookingKey: string, amount: number, accountKey = '1100') => ({ bookingKey, accountKey, creditAmount: { amount, currency: 'CHF' } as never });
  const booking = (okey: string, date: string, status = 'posted', bookingNo = 1) => ({ okey, date, status: status as never, bookingNo, title: okey });

  it('joins credit lines on the receivables account to posted bookings, newest first', () => {
    const result = invoicePaymentCandidates(
      [credit('a', 5000), credit('b', 3000), credit('b', 1000)],
      [booking('a', '20260901'), booking('b', '20260915')],
      '1100', []);
    expect(result).toEqual([
      { bookingKey: 'b', bookingNo: 1, date: '20260915', title: 'b', creditedAmount: 4000 },
      { bookingKey: 'a', bookingNo: 1, date: '20260901', title: 'a', creditedAmount: 5000 },
    ]);
  });
  it('ignores lines of bookings that are not in the list', () => {
    expect(invoicePaymentCandidates([credit('x', 100)], [booking('a', '20260901')], '1100', [])).toEqual([]);
  });
  it('drops drafts, other accounts, debit lines, already linked and okr invoice bookings', () => {
    const result = invoicePaymentCandidates(
      [credit('draft', 100), credit('other', 100, '1020'), { bookingKey: 'debit', accountKey: '1100', creditAmount: undefined },
        credit('linked', 100), credit('invoice-x-storno', 100), credit('ok', 100)],
      [booking('draft', '20260901', 'draft'), booking('other', '20260901'), booking('debit', '20260901'),
        booking('linked', '20260901'), booking('invoice-x-storno', '20260901'), booking('ok', '20260901')],
      '1100', ['linked']);
    expect(result.map((c) => c.bookingKey)).toEqual(['ok']);
  });
  it('caps the list', () => {
    const keys = Array.from({ length: MAX_PAYMENT_CANDIDATES + 5 }, (_, i) => `k${i}`);
    const result = invoicePaymentCandidates(keys.map((k) => credit(k, 100)), keys.map((k) => booking(k, '20260901')), '1100', []);
    expect(result).toHaveLength(MAX_PAYMENT_CANDIDATES);
  });
  it('keeps the bookings closest to the invoice date when capping, shown newest first', () => {
    const result = invoicePaymentCandidates(
      [credit('early', 100), credit('mid', 100), credit('late', 100)],
      [booking('late', '20261020'), booking('early', '20261001'), booking('mid', '20261010')],
      '1100', [], 2);
    expect(result.map((c) => c.bookingKey)).toEqual(['mid', 'early']);
  });
});

describe('linkableBookings', () => {
  it('drops okr invoice bookings and the ones already linked', () => {
    const bookings = ['bank1', 'invoice-a', 'invoice-a-pay-x', 'linked'].map((okey) => ({ okey }));
    expect(linkableBookings(bookings, ['linked']).map((b) => b.okey)).toEqual(['bank1']);
  });
});

describe('chunked', () => {
  it('splits into chunks of at most size items', () => {
    expect(chunked([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunked([], 15)).toEqual([]);
  });
  it('keeps a bookingKey in-query within the 30 disjunctions Firestore allows (× 2 tenants)', () => {
    expect(BOOKING_KEY_CHUNK_SIZE * 2).toBeLessThanOrEqual(30);
  });
});

describe('draftInvoicesOf', () => {
  it('keeps only drafts', () => {
    expect(draftInvoicesOf([invoice(1, [], 'draft'), invoice(1), invoice(1, [], 'paid')])).toHaveLength(1);
  });
});

describe('cancelInputProblem', () => {
  it('accepts a reason and a StoreDate', () => {
    expect(cancelInputProblem('falscher Betrag', '20261002')).toBeUndefined();
  });
  it('wants a non-empty reason of at most 500 characters', () => {
    expect(cancelInputProblem('   ', '20261002')).toBe('reason');
    expect(cancelInputProblem('x'.repeat(INVOICE_CANCEL_REASON_LENGTH + 1), '20261002')).toBe('reason');
    expect(cancelInputProblem('x'.repeat(INVOICE_CANCEL_REASON_LENGTH), '20261002')).toBeUndefined();
  });
  it('wants a date', () => {
    expect(cancelInputProblem('ok', '')).toBe('date');
  });
});

describe('cancelInputProblem with an invoice date', () => {
  it('refuses a storno date before the invoice date', () => {
    expect(cancelInputProblem('ok', '20261001', '20261002')).toBe('before-invoice');
  });
  it('accepts the invoice date itself and later dates', () => {
    expect(cancelInputProblem('ok', '20261002', '20261002')).toBeUndefined();
    expect(cancelInputProblem('ok', '20261003', '20261002')).toBeUndefined();
  });
  it('skips the check without an invoice date', () => {
    expect(cancelInputProblem('ok', '20261001', '')).toBeUndefined();
    expect(cancelInputProblem('ok', '20261001')).toBeUndefined();
  });
});

describe('isPayableState', () => {
  it('accepts pending, partial and unpaid', () => {
    for (const s of ['pending', 'partial', 'unpaid']) expect(isPayableState(s)).toBe(true);
  });
  it('refuses paid, cancelled, draft, issuing and missing states', () => {
    for (const s of ['paid', 'cancelled', 'draft', 'issuing', '', undefined]) expect(isPayableState(s)).toBe(false);
  });
});

describe('isRetryablePaymentRefusal', () => {
  it('retries fixable refusals and network errors', () => {
    expect(isRetryablePaymentRefusal(['overpayment'])).toBe(true);
    expect(isRetryablePaymentRefusal(['period-locked'])).toBe(true);
    expect(isRetryablePaymentRefusal([])).toBe(true);
  });
  it('does not retry when the invoice cannot take a payment', () => {
    expect(isRetryablePaymentRefusal(['not-payable', 'overpayment'])).toBe(false);
    expect(isRetryablePaymentRefusal(['bexio-backend'])).toBe(false);
    expect(isRetryablePaymentRefusal(['invalid-payment-id'])).toBe(false);
  });
});

describe('invoicePaymentValidations', () => {
  const model = (patch: Partial<InvoicePaymentFormModel> = {}): InvoicePaymentFormModel => ({
    mode: 'post', date: '20261002', amount: 50, bankAccountKey: 'bank', bookingKey: '', openAmount: 75, bookingAmount: 0, ...patch,
  });
  it('accepts a complete payment', () => {
    expect(invoicePaymentValidations(model()).isValid()).toBe(true);
  });
  it('refuses zero, negative, non-finite and too high amounts', () => {
    expect(invoicePaymentValidations(model({ amount: 0 })).hasErrors('amount')).toBe(true);
    expect(invoicePaymentValidations(model({ amount: -1 })).hasErrors('amount')).toBe(true);
    expect(invoicePaymentValidations(model({ amount: Number.NaN })).hasErrors('amount')).toBe(true);
    expect(invoicePaymentValidations(model({ amount: 75.01 })).hasErrors('amount')).toBe(true);
    expect(invoicePaymentValidations(model({ amount: 75 })).hasErrors('amount')).toBe(false);
  });
  it('wants a date', () => {
    expect(invoicePaymentValidations(model({ date: '' })).hasErrors('date')).toBe(true);
  });
  it('wants the bank account in mode post, the booking in mode link', () => {
    expect(invoicePaymentValidations(model({ bankAccountKey: '' })).hasErrors('bankAccountKey')).toBe(true);
    expect(invoicePaymentValidations(model({ mode: 'link', bankAccountKey: '' })).hasErrors('bankAccountKey')).toBe(false);
    expect(invoicePaymentValidations(model({ mode: 'link' })).hasErrors('bookingKey')).toBe(true);
  });
  it('caps a linked amount at the booking credit', () => {
    expect(invoicePaymentValidations(model({ mode: 'link', bookingKey: 'b', bookingAmount: 40 })).hasErrors('amount')).toBe(true);
    expect(invoicePaymentValidations(model({ mode: 'link', bookingKey: 'b', bookingAmount: 50 })).isValid()).toBe(true);
  });
});

describe('phase-2 refusals', () => {
  it('expand the blockers of payment-, link- and cancel-blocked', () => {
    for (const reason of ['payment-blocked', 'link-blocked', 'cancel-blocked']) {
      expect(invoiceRefusalReasons({ details: { reason, reasons: ['overpayment', 'no-payment-date'] } })).toEqual(['overpayment', 'no-payment-date']);
    }
  });
  it('fall back to the top-level reason when the list is empty', () => {
    expect(invoiceRefusalReasons({ details: { reason: 'cancel-blocked', reasons: [] } })).toEqual(['cancel-blocked']);
  });
  it('have a text for every reason the payment, cancel and confirmation callables send', () => {
    const reasons = [
      'invalid-payment-id', 'not-a-payment-account', 'payment-blocked', 'link-blocked', 'cancel-blocked', 'inconsistent-state',
      'state-changed', 'no-bank-line', 'not-paid', 'no-receiver', 'period-locked', 'foreign-accounting-tenant', 'no-accounting-config',
      'bexio-backend', 'account-invalid', 'not-payable', 'invalid-amount', 'overpayment', 'no-payment-date', 'booking-not-found',
      'booking-not-posted', 'foreign-booking', 'no-receivables-credit', 'already-linked', 'not-cancellable', 'has-payments', 'no-issue-booking',
      'invoice-booking', 'booking-archived', 'storno-before-invoice',
    ];
    expect(reasons.filter((r) => !INVOICE_REFUSAL_I18N[r])).toEqual([]);
  });
  it('use the context text where the general one would mislead', () => {
    expect(invoiceRefusalKeys(['invalid-amount'], 'payment')).toEqual(['refusal_payment_invalid_amount']);
    expect(invoiceRefusalKeys(['invalid-amount'])).toEqual(['refusal_invalid_amount']);
    expect(invoiceRefusalKeys(['period-locked'], 'cancel')).toEqual(['refusal_cancel_period_locked']);
    expect(invoiceRefusalKeys(['no-receiver'], 'confirmation')).toEqual(['refusal_confirmation_no_receiver']);
    expect(invoiceRefusalText(['overpayment', 'no-payment-date'], i18n, 'fallback', 'payment')).toBe('refusal_overpayment refusal_no_payment_date');
    expect(invoiceRefusalText([], i18n, 'fallback', 'payment')).toBe('fallback');
  });
});

describe('invoice payment hints (spec 1.86)', () => {
  function inv(okey: string, date: string, total: number, state = 'pending'): InvoiceModel {
    const i = invoice(total, [], state);
    i.okey = okey;
    i.invoiceDate = date;
    return i;
  }
  function cand(bookingKey: string, date: string, creditedAmount: number, bookingNo = 1): InvoicePaymentCandidate {
    return { bookingKey, bookingNo, date, title: bookingKey, creditedAmount };
  }

  it('picks the earliest booking crediting exactly the open amount', () => {
    const hints = invoicePaymentHints([inv('a', '20260901', 5000)], [cand('late', '20260920', 5000), cand('early', '20260910', 5000), cand('other', '20260905', 4000)]);
    expect(hints.get('a')).toBe('early');
  });
  it('accepts a booking up to 7 days before the invoice date, not 8', () => {
    expect(invoicePaymentHints([inv('a', '20260910', 5000)], [cand('b', '20260903', 5000)]).get('a')).toBe('b');
    expect(invoicePaymentHints([inv('a', '20260910', 5000)], [cand('b', '20260902', 5000)]).has('a')).toBe(false);
  });
  it('uses one booking for one invoice only, oldest invoice first', () => {
    const hints = invoicePaymentHints([inv('new', '20260905', 5000), inv('old', '20260901', 5000)], [cand('b', '20260910', 5000)]);
    expect(hints.get('old')).toBe('b');
    expect(hints.has('new')).toBe(false);
  });
  it('gives no hint to an invoice that cannot take a payment', () => {
    for (const state of ['draft', 'paid', 'cancelled']) {
      expect(invoicePaymentHints([inv('a', '20260901', 5000, state)], [cand('b', '20260910', 5000)]).size).toBe(0);
    }
  });
  it('includes unwaived reminder fees in the amount to match', () => {
    const i = inv('a', '20260901', 5000);
    i.reminders = [{ level: 1, date: '20261001', dueDate: '', isSent: true, documentKey: '', fee: 1000, bookingKey: '', waivedAt: '', waiveBookingKey: '' }];
    expect(invoicePaymentHints([i], [cand('b', '20261005', 6000)]).get('a')).toBe('b');
  });

  it('the window leaves out invoices older than 365 days and ends today', () => {
    const w = invoicePaymentHintWindow([inv('old', '20250101', 1), inv('a', '20260901', 1)], '20261005');
    expect(w?.invoices.map((i) => i.okey)).toEqual(['a']);
    expect(w?.from).toBe('20260825');
    expect(w?.to).toBe('20261005');
  });
  it('has no window without a recent invoice', () => {
    expect(invoicePaymentHintWindow([inv('old', '20250101', 1)], '20261005')).toBeUndefined();
  });

  it('collects the linked payment bookings of all invoices', () => {
    const a = invoice(100, [50]);
    const b = invoice(100, [50]);
    b.payments[0].bookingKey = '';
    expect(linkedInvoicePaymentKeys([a, b])).toEqual(['b0']);
  });

  it('a preselected booking opens mode link with its date and amount', () => {
    const form = newInvoicePaymentFormModel(invoice(5000), '20261005', ['bank'], cand('b', '20260910', 7000));
    expect(form).toMatchObject({ mode: 'link', date: '20260910', amount: 50, bookingKey: 'b', bookingAmount: 70, openAmount: 50 });
  });
});
