import { only, staticSuite } from 'vest';

import { VideoSection } from '@bk2/shared-models';
import { stringValidations } from '@bk2/shared-util-core';
import { URL_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';

import { baseSectionValidations } from './base-section.validations';

export const videoSectionValidations = staticSuite((model: VideoSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

    stringValidations('url', model.properties?.url, URL_LENGTH);
    stringValidations('width', model.properties?.width, WORD_LENGTH);
    stringValidations('height', model.properties?.height, WORD_LENGTH);
    stringValidations('frameborder', model.properties?.frameborder, WORD_LENGTH);
    stringValidations('baseUrl', model.properties?.baseUrl, URL_LENGTH);
    // tbd: check for kmz, json, csv
});
