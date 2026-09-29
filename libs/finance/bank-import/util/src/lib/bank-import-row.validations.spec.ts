import { describe, expect, it } from 'vitest';

import { BankImportRowModel, MoneyModel } from '@okr/shared-models';

import { bankImportRowValidations } from './bank-import-row.validations';

function model(p: Partial<BankImportRowModel>): BankImportRowModel {
  return { ...new BankImportRowModel('t1', 'acc1'), title: 'Bexio', accountKey: 'a1', ...p };
}

describe('bankImportRowValidations', () => {
  it('accepts a row with title and account set', () => {
    expect(bankImportRowValidations(model({}), 't1', '').isValid()).toBe(true);
  });
  /**
   * A staging row's okey IS the 64-char SHA-256 import key. The shared `baseValidations` caps an
   * okey at SHORT_NAME_LENGTH (30), so every real row reported `okey: tooLong` — the assignment
   * form was permanently invalid, the change-confirmation bar never appeared and nothing could
   * be saved. The form neither shows nor edits the okey, so the suite must not judge it.
   */
  it('accepts the real 64-char SHA-256 okey of an imported row', () => {
    const importKey = 'a'.repeat(64);
    expect(bankImportRowValidations(model({ okey: importKey, importKey }), 't1', '').isValid()).toBe(true);
  });
  it('requires title and account', () => {
    expect(bankImportRowValidations(model({ title: '' }), 't1', '').isValid()).toBe(false);
    expect(bankImportRowValidations(model({ accountKey: '' }), 't1', '').isValid()).toBe(false);
  });

  describe('split assignment', () => {
    const split = (p = {}) => ({ title: 'Anteil Ressort B', accountKey: 'a2', vatCodeKey: '', amount: 3000, ...p });
    const gross = (amount: number) => ({ amount: new MoneyModel(amount, 'CHF') });

    it('accepts parts that leave a positive rest for the main part, for money in and out', () => {
      expect(bankImportRowValidations(model({ ...gross(10000), splits: [split()] }), 't1', '').isValid()).toBe(true);
      expect(bankImportRowValidations(model({ ...gross(-10000), splits: [split(), split()] }), 't1', '').isValid()).toBe(true);
    });
    it('rejects a part without text, account or amount', () => {
      for (const bad of [{ title: ' ' }, { accountKey: '' }, { amount: 0 }]) {
        const result = bankImportRowValidations(model({ ...gross(10000), splits: [split(bad)] }), 't1', '');
        expect(result.getErrors('splits')).toContain('@finance/bank-import/util.validation.splitIncomplete');
      }
    });
    it('rejects parts that use up the whole amount — the main part needs a rest', () => {
      const result = bankImportRowValidations(model({ ...gross(-6000), splits: [split({ amount: 6000 })] }), 't1', '');
      expect(result.getErrors('splits')).toContain('@finance/bank-import/util.validation.splitExceeds');
    });
    it('accepts a legacy row without splits', () => {
      expect(bankImportRowValidations(model({ splits: undefined as never }), 't1', '').isValid()).toBe(true);
    });
  });
});
