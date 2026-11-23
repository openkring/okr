import { describe, expect, it } from 'vitest';

import { NAME_LENGTH } from '@okr/shared-constants';

import { categoryItemLabelValidations, newCategoryItemLabel } from './category-item-label.validations';

describe('categoryItemLabelValidations', () => {
  it('accepts no label at all: the name is shown then', () => {
    expect(categoryItemLabelValidations(newCategoryItemLabel()).isValid()).toBe(true);
  });
  it('accepts a label in one language', () => {
    expect(categoryItemLabelValidations(newCategoryItemLabel({ de: 'Pager' })).isValid()).toBe(true);
  });
  it('rejects a label that is too long, under its language', () => {
    const result = categoryItemLabelValidations(newCategoryItemLabel({ fr: 'x'.repeat(NAME_LENGTH + 1) }));
    expect(result.hasErrors('fr')).toBe(true);
    expect(result.hasErrors('de')).toBe(false);
  });
});

describe('newCategoryItemLabel', () => {
  it('fills the languages a stored row lacks', () => {
    expect(newCategoryItemLabel({ de: 'Pager', en: undefined })).toEqual({ de: 'Pager', en: '', fr: '', es: '', it: '' });
  });
});
