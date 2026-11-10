import { enforce, omitWhen, staticSuite, test } from 'vest';

import { EventsSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';
import { isSectionCtaUrl } from './section-cta.util';

/** The «more» url of an events section: empty, or a link the website and the app can follow safely. */
export const eventsSectionValidations = staticSuite((model: EventsSection) => {
  baseSectionValidations(model);
  const moreUrl = model.properties?.moreUrl ?? '';

  omitWhen(!moreUrl.trim(), () => {
    test('moreUrl', 'invalidValue', () => {
      enforce(isSectionCtaUrl(moreUrl)).isTruthy();
    });
  });
});
