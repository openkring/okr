import { only, staticSuite } from 'vest';

import { IframeSection } from '@bk2/shared-models';
import { stringValidations } from '@bk2/shared-util-core';
import { LONG_NAME_LENGTH, NAME_LENGTH } from '@bk2/shared-constants';

import { baseSectionValidations } from './base-section.validations';

export const iframeSectionValidations = staticSuite((model: IframeSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

  stringValidations('style', model.properties?.style, NAME_LENGTH);
  stringValidations('url', model.properties?.url, LONG_NAME_LENGTH);
});
