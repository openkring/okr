import { describe, expect, it } from 'vitest';

import { BankRuleModel } from '@okr/shared-models';

import { bankRuleValidations } from './bank-rule.validations';

function model(p: Partial<BankRuleModel>): BankRuleModel {
  return { ...new BankRuleModel('t1', 'acc1'), term: 'google', title: 'Google', accountKey: 'a1', ...p };
}

describe('bankRuleValidations', () => {
  it('accepts a complete contains rule', () => {
    expect(bankRuleValidations(model({}), 't1', '').isValid()).toBe(true);
  });
  it('requires term, title and account', () => {
    expect(bankRuleValidations(model({ term: '' }), 't1', '').isValid()).toBe(false);
    expect(bankRuleValidations(model({ title: '' }), 't1', '').isValid()).toBe(false);
    expect(bankRuleValidations(model({ accountKey: '' }), 't1', '').isValid()).toBe(false);
  });
  /**
   * The form offers 100 characters for the Buchungstext (`[maxLength]="100"`), so the suite must
   * accept them. It used to cap the title at SHORT_NAME_LENGTH (30): typing a 31st character
   * silently invalidated the form and the change-confirmation bar vanished with no error shown.
   */
  it('accepts a title of the full length the form offers (100)', () => {
    expect(bankRuleValidations(model({ title: 'x'.repeat(100) }), 't1', '').isValid()).toBe(true);
    expect(bankRuleValidations(model({ title: 'x'.repeat(101) }), 't1', '').isValid()).toBe(false);
  });
  it('rejects a regex rule whose pattern does not compile', () => {
    expect(bankRuleValidations(model({ condition: 'regex', term: '(' }), 't1', '').isValid()).toBe(false);
    expect(bankRuleValidations(model({ condition: 'regex', term: 'goo(gle)' }), 't1', '').isValid()).toBe(true);
  });
});
