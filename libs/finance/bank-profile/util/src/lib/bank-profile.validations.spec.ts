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
  it('rejects an unknown format', () => {
    expect(bankProfileValidations(model({ format: 'ubs' as never }), 't1', '').isValid()).toBe(false);
  });
});
