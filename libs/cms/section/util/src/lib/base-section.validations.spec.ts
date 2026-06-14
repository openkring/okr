import { describe, expect, it } from 'vitest';
import { MAP_SECTION_SHAPE, SectionModel } from '@bk2/shared-models';

import { baseSectionValidations } from './base-section.validations';

describe('baseSectionValidations', () => {
  it('does not flag a valid name', () => {
    expect(baseSectionValidations({ ...MAP_SECTION_SHAPE } as SectionModel).hasErrors('name')).toBe(false);
  });

  it('flags a non-string name', () => {
    const model = { ...MAP_SECTION_SHAPE, name: 123 } as unknown as SectionModel;
    expect(baseSectionValidations(model).hasErrors('name')).toBe(true);
  });

  it('flags a non-boolean isArchived', () => {
    const model = { ...MAP_SECTION_SHAPE, isArchived: 'yes' } as unknown as SectionModel;
    expect(baseSectionValidations(model).hasErrors('isArchived')).toBe(true);
  });
});
