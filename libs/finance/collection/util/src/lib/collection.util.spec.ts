import { describe, expect, it } from 'vitest';
import { MAX_TOPUP, MIN_TOPUP } from '@okr/business-metering-util';
import type { SavedPaymentMethod } from '@okr/shared-models';

import { formatChfAmount, formatSignedChf, payErrorKind, stripeReturnNotice, topUpBounds, zurichStoreDateTime, paymentMethodLabel, topUpAmountError } from './collection.util';

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

describe('zurichStoreDateTime', () => {
  it('renders the Zurich wall clock (CET, winter)', () => expect(zurichStoreDateTime(new Date('2026-11-09T10:05:07Z'))).toBe('20261109110507'));
  it('renders the Zurich wall clock (CEST, summer)', () => expect(zurichStoreDateTime(new Date('2026-07-01T22:30:00Z'))).toBe('20260702003000'));
});

describe('stripeReturnNotice', () => {
  const now = new Date('2026-11-09T10:00:00Z'); // 11:00 in Zurich
  const old = { ...card, stripePaymentMethodId: 'pm_old', consentAt: '20260101120000' };
  it('is empty without a Stripe return', () => expect(stripeReturnNotice(undefined, old, 'pm_old', now)).toBe(''));
  it('done, no method yet: saving', () => expect(stripeReturnNotice('done', null, '', now)).toBe('saving'));
  it('done, still the old method (stale doc): saving', () => expect(stripeReturnNotice('done', old, 'pm_old', now)).toBe('saving'));
  it('done, the method changed since landing: saved', () => {
    expect(stripeReturnNotice('done', { ...old, stripePaymentMethodId: 'pm_new' }, 'pm_old', now)).toBe('saved');
  });
  it('done, first method arrived after landing: saved', () => {
    expect(stripeReturnNotice('done', { ...old, stripePaymentMethodId: 'pm_new' }, '', now)).toBe('saved');
  });
  it('done, webhook wrote before the page loaded (consent within 10 minutes): saved', () => {
    expect(stripeReturnNotice('done', { ...old, consentAt: '20261109105500' }, 'pm_old', now)).toBe('saved');
  });
  it('done, consent older than 10 minutes and unchanged: saving', () => {
    expect(stripeReturnNotice('done', { ...old, consentAt: '20261109104900' }, 'pm_old', now)).toBe('saving');
  });
  it('done, before the first snapshot: saving unless the consent is fresh', () => {
    expect(stripeReturnNotice('done', old, undefined, now)).toBe('saving');
    expect(stripeReturnNotice('done', { ...old, consentAt: '20261109105900' }, undefined, now)).toBe('saved');
  });
  it('cancel: cancelled without a method, nothing with one', () => {
    expect(stripeReturnNotice('cancel', null, '', now)).toBe('cancelled');
    expect(stripeReturnNotice('cancel', old, 'pm_old', now)).toBe('');
  });
});

describe('topUpBounds', () => {
  it('formats MIN_TOPUP and MAX_TOPUP as CHF', () => expect(topUpBounds()).toEqual({ min: '50.00', max: "5'000.00" }));
});
