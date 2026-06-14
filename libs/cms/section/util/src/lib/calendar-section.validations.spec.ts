import { describe, expect, it } from 'vitest';
import { CAL_SECTION_SHAPE, CalendarSection } from '@bk2/shared-models';

import { calendarSectionValidations } from './calendar-section.validations';

describe('calendarSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(calendarSectionValidations({ ...CAL_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...CAL_SECTION_SHAPE, title: 123 } as unknown as CalendarSection;
    expect(calendarSectionValidations(model).hasErrors('title')).toBe(true);
  });
});
