import { only, staticSuite } from 'vest';

import { CalendarSection } from '@bk2/shared-models';

import { baseSectionValidations } from './base-section.validations';

export const calendarSectionValidations = staticSuite((model: CalendarSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

    // tbd: properties: CalendarOptions (from FullCalendar)
});
