import { describe, expect, it } from 'vitest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { OcrRuleModel } from '@okr/shared-models';

import { fromOcrRuleFormModel, ocrRuleValidations, toOcrRuleFormModel } from './ocr-rule.validations';

const newForm = () => toOcrRuleFormModel(new OcrRuleModel('scs'));

describe('ocrRuleValidations', () => {
  it('accepts a new, empty rule (nothing was mandatory before)', () => {
    expect(ocrRuleValidations(newForm()).isValid()).toBe(true);
  });

  it('rejects a party longer than LONG_NAME_LENGTH', () => {
    const model = { ...newForm(), party: 'x'.repeat(LONG_NAME_LENGTH + 1) };
    expect(ocrRuleValidations(model).hasErrors('party')).toBe(true);
  });

  it('rejects alias text longer than DESCRIPTION_LENGTH', () => {
    const model = { ...newForm(), aliasText: 'x'.repeat(DESCRIPTION_LENGTH + 1) };
    expect(ocrRuleValidations(model).hasErrors('aliasText')).toBe(true);
  });

  it('rejects a rank that is not a number', () => {
    const model = { ...newForm(), rank: 'abc' as unknown as number };
    expect(ocrRuleValidations(model).hasErrors('rank')).toBe(true);
  });
});

describe('toOcrRuleFormModel / fromOcrRuleFormModel', () => {
  it('joins aliases into text and splits them back, trimmed and without blanks', () => {
    const rule = { ...new OcrRuleModel('scs'), aliases: ['migros', 'mgb'] };
    const formModel = toOcrRuleFormModel(rule);
    expect(formModel.aliasText).toBe('migros, mgb');
    const back = fromOcrRuleFormModel({ ...formModel, aliasText: ' migros , ,coop ' });
    expect(back.aliases).toEqual(['migros', 'coop']);
    expect('aliasText' in back).toBe(false);
  });

  it('keeps the rank numeric', () => {
    const back = fromOcrRuleFormModel({ ...newForm(), rank: '7' as unknown as number });
    expect(back.rank).toBe(7);
  });

  it('copes with a legacy rule without aliases', () => {
    const rule = { ...new OcrRuleModel('scs'), aliases: undefined as unknown as string[] };
    expect(toOcrRuleFormModel(rule).aliasText).toBe('');
  });
});
