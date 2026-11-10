import { describe, expect, it } from 'vitest';

import { BILLING_EMAIL_LENGTH, billingEmailValidations } from './billing-email.validations';

describe('billing e-mail validations', () => {
  it('accepts an address', () => expect(billingEmailValidations({ email: 'kasse@verein.ch' }).hasErrors()).toBe(false));
  it('ignores surrounding blanks (the server trims)', () => {
    expect(billingEmailValidations({ email: '  kasse@verein.ch ' }).hasErrors()).toBe(false);
  });
  it('requires an address', () => {
    const r = billingEmailValidations({ email: ' ' });
    expect(r.getErrors('email')).toEqual(['@finance/collection/feature.validation.email_required']);
  });
  it('rejects an address without domain or dot', () => {
    expect(billingEmailValidations({ email: 'kasse@verein' }).hasErrors('email')).toBe(true);
    expect(billingEmailValidations({ email: 'kasse' }).hasErrors('email')).toBe(true);
    expect(billingEmailValidations({ email: 'ka sse@verein.ch' }).hasErrors('email')).toBe(true);
  });
  it('rejects an address longer than the field allows', () => {
    const long = 'a'.repeat(BILLING_EMAIL_LENGTH) + '@verein.ch';
    expect(billingEmailValidations({ email: long }).getErrors('email')).toEqual(['@finance/collection/feature.validation.email_too_long']);
  });
  it('a missing field reads as empty (legacy doc)', () => {
    expect(billingEmailValidations({} as never).hasErrors('email')).toBe(true);
  });
});
