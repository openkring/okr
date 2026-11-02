import { describe, expect, it } from 'vitest';
import { Field } from '@okr/shared-models';
import { categoryNamesOf, findDuplicateKeys, isDisplayField, misplacedSsnFields } from './field-kind';
import { getFormMapping } from './form-mappings';

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

describe('misplacedSsnFields', () => {
  const ssn = (key: string) => f('ssn', { key });

  it('accepts an ssn field keyed ssnId on an application mapping', () => {
    expect(misplacedSsnFields([ssn('ssnId'), f('text')], getFormMapping('applications.default'))).toEqual([]);
  });

  it('reports another key, a non-application mapping and a URL target (no mapping)', () => {
    expect(misplacedSsnFields([ssn('ahv')], getFormMapping('applications.default'))).toEqual(['ahv']);
    expect(misplacedSsnFields([ssn('ssnId')], getFormMapping('prospects.default'))).toEqual(['ssnId']);
    expect(misplacedSsnFields([ssn('ssnId')], undefined)).toEqual(['ssnId']);
  });

  it('ignores a legacy text field keyed ssnId and a definition without fields', () => {
    expect(misplacedSsnFields([f('text', { key: 'ssnId' })], undefined)).toEqual([]);
    expect(misplacedSsnFields(undefined, undefined)).toEqual([]);
  });
});
