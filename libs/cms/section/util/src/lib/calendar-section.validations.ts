import { staticSuite } from 'vest';

import { CalendarSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';

export const calendarSectionValidations = staticSuite((model: CalendarSection) => {
  baseSectionValidations(model);

    // tbd: properties: CalendarOptions (from FullCalendar)
});
