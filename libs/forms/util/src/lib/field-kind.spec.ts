import { describe, expect, it } from 'vitest';
import { Field } from '@okr/shared-models';
import { categoryNamesOf, findDuplicateKeys, isDisplayField } from './field-kind';

const f = (type: string, extra: object = {}) => ({ id: type, key: type, label: type, required: false, width: 'full', order: 0, type, ...extra }) as Field;

describe('categoryNamesOf', () => {
  it('collects the distinct names of category fields and skips empty ones', () => {
    const fields = [f('text'), f('category', { categoryName: 'gender' }), f('category', { categoryName: '' }), f('category', { categoryName: 'gender' }), f('category', { categoryName: 'boatType' })];
    expect(categoryNamesOf(fields)).toEqual(['gender', 'boatType']);
  });

  it('returns [] for a form without category fields', () => {
    expect(categoryNamesOf([f('text'), f('divider')])).toEqual([]);
  });
});

describe('isDisplayField', () => {
  it('treats label and divider as display-only', () => {
    expect(isDisplayField('label')).toBe(true);
    expect(isDisplayField('paragraph')).toBe(true);
    expect(isDisplayField('category')).toBe(false);
  });
});

describe('findDuplicateKeys', () => {
  const k = (type: string, key: string) => f(type, { key });

  it('returns the keys used by more than one input field, once each', () => {
    expect(findDuplicateKeys([k('text', 'a'), k('radio', 'b'), k('checkbox', 'a'), k('text', 'b'), k('text', 'a')])).toEqual(['a', 'b']);
  });

  it('returns [] for distinct keys, an empty list or no list', () => {
    expect(findDuplicateKeys([k('text', 'a'), k('text', 'b')])).toEqual([]);
    expect(findDuplicateKeys([])).toEqual([]);
    expect(findDuplicateKeys(undefined)).toEqual([]);
  });

  it('ignores display elements and empty keys', () => {
    expect(findDuplicateKeys([k('divider', 'x'), k('divider', 'x'), k('label', ''), k('text', ''), k('text', '')])).toEqual([]);
  });
});
