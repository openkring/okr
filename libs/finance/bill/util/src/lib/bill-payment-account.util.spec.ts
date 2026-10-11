import { describe, expect, it } from 'vitest';

import { needsPaymentAccountChoice, resolvePaymentAccountKey } from './bill-payment-account.util';

describe('resolvePaymentAccountKey', () => {
  it('defaults to the only configured account', () => expect(resolvePaymentAccountKey(undefined, ['a1'])).toEqual({ key: 'a1' }));
  it('accepts a configured choice', () => expect(resolvePaymentAccountKey('a2', ['a1', 'a2'])).toEqual({ key: 'a2' }));
  it('requires a choice when several are configured', () =>
    expect(resolvePaymentAccountKey('', ['a1', 'a2'])).toEqual({ refusal: 'payment-account-required' }));
  it('refuses an account outside the list', () =>
    expect(resolvePaymentAccountKey('x', ['a1', 'a2'])).toEqual({ refusal: 'payment-account-invalid' }));
  it('leaves it empty when the books configure none', () => expect(resolvePaymentAccountKey(undefined, [])).toEqual({ key: '' }));
});

describe('needsPaymentAccountChoice', () => {
  it('asks only with several accounts', () => {
    expect(needsPaymentAccountChoice(['a1'])).toBe(false);
    expect(needsPaymentAccountChoice(['a1', 'a2'])).toBe(true);
  });
});
