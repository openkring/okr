import { describe, expect, it } from 'vitest';
import { LONG_NAME_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { MAP_SECTION_SHAPE, SectionModel } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';

describe('baseSectionValidations', () => {
  it('does not flag a valid name', () => {
    expect(baseSectionValidations({ ...MAP_SECTION_SHAPE } as SectionModel).hasErrors('name')).toBe(false);
  });

  it('flags a non-string name', () => {
    const model = { ...MAP_SECTION_SHAPE, name: 123 } as unknown as SectionModel;
    expect(baseSectionValidations(model).hasErrors('name')).toBe(true);
  });

  // the caps must match the maxLength the section form offers, see section-configuration
  it('accepts a title of exactly LONG_NAME_LENGTH characters', () => {
    const model = { ...MAP_SECTION_SHAPE, title: 'a'.repeat(LONG_NAME_LENGTH) } as SectionModel;
    expect(baseSectionValidations(model).hasErrors('title')).toBe(false);
  });

  it('flags a title longer than LONG_NAME_LENGTH', () => {
    const model = { ...MAP_SECTION_SHAPE, title: 'a'.repeat(LONG_NAME_LENGTH + 1) } as SectionModel;
    expect(baseSectionValidations(model).hasErrors('title')).toBe(true);
  });

  it('accepts a subTitle of exactly LONG_NAME_LENGTH characters', () => {
    const model = { ...MAP_SECTION_SHAPE, subTitle: 'a'.repeat(LONG_NAME_LENGTH) } as SectionModel;
    expect(baseSectionValidations(model).hasErrors('subTitle')).toBe(false);
  });

  it('accepts a name of exactly NAME_LENGTH characters', () => {
    const model = { ...MAP_SECTION_SHAPE, name: 'a'.repeat(NAME_LENGTH) } as SectionModel;
    expect(baseSectionValidations(model).hasErrors('name')).toBe(false);
  });

  it('flags a non-boolean isArchived', () => {
    const model = { ...MAP_SECTION_SHAPE, isArchived: 'yes' } as unknown as SectionModel;
    expect(baseSectionValidations(model).hasErrors('isArchived')).toBe(true);
  });
});
