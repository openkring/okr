import { describe, expect, it } from 'vitest';

import { TagStringFormData, tagStringValidations } from './tag-string.validations';

function model(over: Partial<TagStringFormData> = {}): TagStringFormData {
  return { key: '@tag.ezs', de: 'EZS', en: '', fr: '', es: '', it: '', ...over };
}

describe('tagStringValidations', () => {
  it('accepts a key with only some languages filled — an empty language means no override', () => {
    expect(tagStringValidations(model()).isValid()).toBe(true);
  });

  it('accepts a key with no labels at all', () => {
    expect(tagStringValidations(model({ de: '' })).isValid()).toBe(true);
  });

  it('rejects an empty key — the change-confirmation must not appear', () => {
    const result = tagStringValidations(model({ key: '' }));
    expect(result.isValid()).toBe(false);
    expect(result.getErrors()['key']).toBeTruthy();
  });

  it('rejects a key longer than the short-name limit', () => {
    expect(tagStringValidations(model({ key: '@tag.' + 'x'.repeat(60) })).isValid()).toBe(false);
  });
});
