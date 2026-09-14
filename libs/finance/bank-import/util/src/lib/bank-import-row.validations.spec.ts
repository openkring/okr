import { describe, expect, it } from 'vitest';

import { BankImportRowModel } from '@okr/shared-models';

import { bankImportRowValidations } from './bank-import-row.validations';

function model(p: Partial<BankImportRowModel>): BankImportRowModel {
  return { ...new BankImportRowModel('t1', 'acc1'), title: 'Bexio', accountKey: 'a1', ...p };
}

describe('bankImportRowValidations', () => {
  it('accepts a row with title and account set', () => {
    expect(bankImportRowValidations(model({}), 't1', '').isValid()).toBe(true);
  });
  it('requires title and account', () => {
    expect(bankImportRowValidations(model({ title: '' }), 't1', '').isValid()).toBe(false);
    expect(bankImportRowValidations(model({ accountKey: '' }), 't1', '').isValid()).toBe(false);
  });
});
