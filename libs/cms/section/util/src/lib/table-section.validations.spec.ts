import { describe, expect, it } from 'vitest';
import { TABLE_SECTION_SHAPE, TableSection } from '@bk2/shared-models';

import { tableSectionValidations } from './table-section.validations';

describe('tableSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(tableSectionValidations({ ...TABLE_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...TABLE_SECTION_SHAPE, title: 123 } as unknown as TableSection;
    expect(tableSectionValidations(model).hasErrors('title')).toBe(true);
  });
});
