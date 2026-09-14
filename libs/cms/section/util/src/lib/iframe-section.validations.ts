import { only, staticSuite } from 'vest';

import { IframeSection } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';
import { COMMENT_LENGTH, URL_LENGTH } from '@okr/shared-constants';

import { baseSectionValidations } from './base-section.validations';

export const iframeSectionValidations = staticSuite((model: IframeSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

  // caps mirror the maxLength of the fields in iframe-configuration (okr-text-input / okr-url)
  stringValidations('style', model.properties?.style, COMMENT_LENGTH);
  stringValidations('url', model.properties?.url, URL_LENGTH);
});
