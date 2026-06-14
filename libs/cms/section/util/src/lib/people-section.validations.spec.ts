import { describe, expect, it } from 'vitest';
import { PEOPLE_SECTION_SHAPE, PeopleSection } from '@bk2/shared-models';

import { peopleSectionValidations } from './people-section.validations';

describe('peopleSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(peopleSectionValidations({ ...PEOPLE_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...PEOPLE_SECTION_SHAPE, title: 123 } as unknown as PeopleSection;
    expect(peopleSectionValidations(model).hasErrors('title')).toBe(true);
  });
});
