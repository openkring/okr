import { describe, expect, it } from 'vitest';
import { MAX_TOPUP, MIN_TOPUP } from '@okr/business-metering-util';
import type { SavedPaymentMethod } from '@okr/shared-models';

import { formatChfAmount, formatSignedChf, payErrorKind, paymentMethodLabel, topUpAmountError } from './collection.util';

const card: SavedPaymentMethod = {
  type: 'card', brand: 'visa', last4: '4242', expMonth: 8, expYear: 2028, email: '', stripePaymentMethodId: 'pm_1', consentAt: '',
};

describe('paymentMethodLabel', () => {
  it('shows a card as brand, last four digits and expiry', () => expect(paymentMethodLabel(card)).toBe('Visa ••4242, 08/28'));
  it('names known brands properly', () => expect(paymentMethodLabel({ ...card, brand: 'amex' })).toBe('American Express ••4242, 08/28'));
  it('capitalises an unknown brand', () => expect(paymentMethodLabel({ ...card, brand: 'discover' })).toBe('Discover ••4242, 08/28'));
  it('shows PayPal with its e-mail', () => {
    expect(paymentMethodLabel({ ...card, type: 'paypal', brand: '', last4: '', expMonth: 0, expYear: 0, email: 'name@example.ch' }))
      .toBe('PayPal name@example.ch');
  });
  it('is empty without a method (missing on a legacy doc)', () => {
    expect(paymentMethodLabel(null)).toBe('');
    expect(paymentMethodLabel(undefined)).toBe('');
  });
  it('leaves out a missing expiry', () => expect(paymentMethodLabel({ ...card, expMonth: 0, expYear: 0 })).toBe('Visa ••4242'));
});

describe('topUpAmountError', () => {
  it('accepts the bounds', () => {
    expect(topUpAmountError(MIN_TOPUP)).toBe('');
    expect(topUpAmountError(MAX_TOPUP)).toBe('');
  });
  it('refuses below the minimum', () => expect(topUpAmountError(MIN_TOPUP - 1)).toBe('min'));
  it('refuses above the maximum', () => expect(topUpAmountError(MAX_TOPUP + 1)).toBe('max'));
  it('refuses a fraction of a Rappen or no number', () => {
    expect(topUpAmountError(5000.5)).toBe('min');
    expect(topUpAmountError(Number.NaN)).toBe('min');
  });
});

describe('formatChfAmount', () => {
  it('groups thousands and keeps two decimals', () => expect(formatChfAmount(100000050)).toBe("1'000'000.50"));
  it('treats a missing amount as 0', () => expect(formatChfAmount(undefined as unknown as number)).toBe('0.00'));
});

describe('formatSignedChf', () => {
  it('signs a credit', () => expect(formatSignedChf(5000)).toBe('+50.00'));
  it('signs a debit', () => expect(formatSignedChf(-150)).toBe('−1.50'));
  it('groups thousands Swiss style', () => expect(formatSignedChf(123456)).toBe("+1'234.56"));
  it('shows zero unsigned', () => expect(formatSignedChf(0)).toBe('0.00'));
});

describe('payErrorKind', () => {
  it('reads a failed-precondition without reason as a paid invoice (not-open)', () => {
    expect(payErrorKind({ code: 'functions/failed-precondition', message: 'This invoice has nothing open to pay.' })).toBe('paid');
  });
  it('reads the receiver-not-a-tenant reason', () => {
    expect(payErrorKind({ code: 'functions/failed-precondition', details: { reason: 'receiver-not-a-tenant' } })).toBe('not-tenant');
  });
  it('reads anything else as an error', () => {
    expect(payErrorKind({ code: 'functions/permission-denied' })).toBe('error');
    expect(payErrorKind(new Error('network'))).toBe('error');
    expect(payErrorKind(undefined)).toBe('error');
  });
});
