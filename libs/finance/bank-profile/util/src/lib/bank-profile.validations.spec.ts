import { describe, expect, it } from 'vitest';

import { BankProfileModel } from '@okr/shared-models';

import { bankProfileValidations } from './bank-profile.validations';

function model(p: Partial<BankProfileModel>): BankProfileModel {
  return {
    ...new BankProfileModel('t1', 'acc1'),
    iban: 'CH9300762011623852957',
    bankName: 'PostFinance Geschäftskonto',
    accountKey: 'a1',
    currency: 'CHF',
    ...p,
  };
}

describe('bankProfileValidations', () => {
  it('accepts a complete profile', () => {
    expect(bankProfileValidations(model({}), 't1', '').isValid()).toBe(true);
  });
  it('requires iban and accountKey', () => {
    expect(bankProfileValidations(model({ iban: '' }), 't1', '').isValid()).toBe(false);
    expect(bankProfileValidations(model({ accountKey: '' }), 't1', '').isValid()).toBe(false);
  });
  /** The form offers 50 characters for the bank name; the suite used to cap it at 30. */
  it('accepts a bank name of the full length the form offers (50)', () => {
    expect(bankProfileValidations(model({ bankName: 'x'.repeat(50) }), 't1', '').isValid()).toBe(true);
    expect(bankProfileValidations(model({ bankName: 'x'.repeat(51) }), 't1', '').isValid()).toBe(false);
  });
  it('rejects an unknown format', () => {
    expect(bankProfileValidations(model({ format: 'ubs' as never }), 't1', '').isValid()).toBe(false);
  });
});
