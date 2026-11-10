import { describe, expect, it } from 'vitest';

import { EVENTS_SECTION_SHAPE, EventsSection } from '@okr/shared-models';
import { eventsSectionValidations } from './events-section.validations';
import { getSectionValidationSuite } from './section-validation-registry';

const model = (props: Partial<EventsSection['properties']>): EventsSection =>
  ({ ...EVENTS_SECTION_SHAPE, properties: { ...EVENTS_SECTION_SHAPE.properties, ...props } }) as EventsSection;

describe('eventsSectionValidations (1.151)', () => {
  it('accepts an empty more url, app routes and website pages', () => {
    for (const moreUrl of ['', '/calevent/my/c-calevents', 'termine.html', '#public']) {
      expect(eventsSectionValidations(model({ moreUrl })).hasErrors('moreUrl')).toBe(false);
    }
  });

  it('rejects unsafe urls', () => {
    for (const moreUrl of ['javascript:alert(1)', '//evil.com', 'http://x.ch']) {
      expect(eventsSectionValidations(model({ moreUrl })).hasErrors('moreUrl')).toBe(true);
    }
  });

  it('is the registered suite for events', () => {
    expect(getSectionValidationSuite('events')(model({ moreUrl: '//evil.com' })).hasErrors('moreUrl')).toBe(true);
  });
});
