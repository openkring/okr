import { describe, expect, it } from 'vitest';
import { Field } from '@okr/shared-models';
import { categoryNamesOf, isDisplayField } from './field-kind';

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
    expect(isDisplayField('category')).toBe(false);
  });
});
