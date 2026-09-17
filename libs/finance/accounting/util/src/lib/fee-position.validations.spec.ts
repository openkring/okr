import { describe, expect, it } from 'vitest';

import { FeePositionRule } from '@okr/shared-models';

import { feePositionValidations } from './fee-position.validations';

describe('feePositionValidations', () => {
  const rule = (o: Partial<FeePositionRule> = {}): FeePositionRule =>
    ({ key: 'jb', usage: 'membershipFee', type: 'fix', label: 'Jahresbeitrag',
      source: 'category', categoryList: 'mcat_scs', ...o });

  it('accepts a complete category rule', () => {
    expect(feePositionValidations(rule()).isValid()).toBe(true);
  });

  it('requires a category list for a category rule', () => {
    expect(feePositionValidations(rule({ categoryList: '' })).isValid()).toBe(false);
  });

  it('requires an amount for a flag rule', () => {
    expect(feePositionValidations(rule({ source: 'flag', flag: 'hasLocker', amount: undefined })).isValid()).toBe(false);
  });

  it('accepts a flag rule with an amount', () => {
    expect(feePositionValidations(rule({ source: 'flag', flag: 'hasLocker', amount: 50 })).isValid()).toBe(true);
  });

  it('requires a key and a label', () => {
    expect(feePositionValidations(rule({ key: '' })).getErrors('key').length).toBeGreaterThan(0);
    expect(feePositionValidations(rule({ label: '' })).getErrors('label').length).toBeGreaterThan(0);
  });

  it('accepts a manual rule without a category list or amount', () => {
    expect(feePositionValidations(rule({ source: 'manual', categoryList: undefined, amount: undefined })).isValid()).toBe(true);
  });

  it('requires an amount for a rule-based position', () => {
    expect(feePositionValidations(rule({ source: 'rule', rule: 'newMemberOver25', amount: undefined })).isValid()).toBe(false);
  });
});
