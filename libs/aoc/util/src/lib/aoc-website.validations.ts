import { only, staticSuite } from 'vest';

import { WebsiteContentModel } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

/**
 * Validates a website text (`websiteContent`) in the aoc edit modal.
 * The modal used to save without any check, so this only asks for what the store needs: both
 * language texts are strings (empty is fine). No length cap — an HTML text may be long, and the
 * key is not edited here (it is chosen when the text is created).
 */
export const aocWebsiteValidations = staticSuite((model: WebsiteContentModel, field?: string) => {
  if (field) only(field);

  stringValidations('de', model.de);
  stringValidations('en', model.en);
});
