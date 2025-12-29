import { only, staticSuite } from 'vest';

import { ChatSection } from '@bk2/shared-models';
import { stringValidations } from '@bk2/shared-util-core';
import { DESCRIPTION_LENGTH, NAME_LENGTH, URL_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';

import { baseSectionValidations } from './base-section.validations';

export const chatSectionValidations = staticSuite((model: ChatSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

    stringValidations('id', model.properties?.id, WORD_LENGTH);
    stringValidations('name', model.properties?.name, NAME_LENGTH);
    stringValidations('url', model.properties?.url, URL_LENGTH);
    stringValidations('description', model.properties?.description, DESCRIPTION_LENGTH);
    stringValidations('type', model.properties?.type, WORD_LENGTH);

});
