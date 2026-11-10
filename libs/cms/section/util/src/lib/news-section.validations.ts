import { enforce, omitWhen, staticSuite, test } from 'vest';

import { NewsSection } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';
import { URL_LENGTH } from '@okr/shared-constants';

import { baseSectionValidations } from './base-section.validations';
import { isSectionCtaUrl } from './section-cta.util';

/**
 * The «more» url of a news section: empty, or a link the website and the app can follow safely
 * (`isSectionCtaUrl`). Only checked while the more button is on — the editor hides the field otherwise.
 */
export const newsSectionValidations = staticSuite((model: NewsSection) => {
  baseSectionValidations(model);
  const config = model.properties;
  const moreUrl = config?.moreUrl ?? '';

  omitWhen(config?.showMoreButton !== true, () => {
    // cap mirrors the [maxLength] of the field in news-configuration
    stringValidations('moreUrl', moreUrl, URL_LENGTH);
    omitWhen(!moreUrl.trim(), () => {
      test('moreUrl', 'invalidValue', () => {
        enforce(isSectionCtaUrl(moreUrl)).isTruthy();
      });
    });
  });
});
