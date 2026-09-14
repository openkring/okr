import { only, staticSuite } from 'vest';

import { ChatSection } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';
import { DESCRIPTION_LENGTH, NAME_LENGTH, URL_LENGTH, WORD_LENGTH } from '@okr/shared-constants';

import { baseSectionValidations } from './base-section.validations';

export const chatSectionValidations = staticSuite((model: ChatSection, field?: string) => {
  if (field) only(field);

  baseSectionValidations(model, field);

  // Prefixed with 'chat.': plain 'name' and 'type' would collide with the base section's own
  // name/type, and both fields would then show each other's errors.
  stringValidations('chat.id', model.properties?.id, NAME_LENGTH);
  stringValidations('chat.name', model.properties?.name, NAME_LENGTH);
  stringValidations('chat.url', model.properties?.url, URL_LENGTH);
  stringValidations('chat.description', model.properties?.description, DESCRIPTION_LENGTH);
  stringValidations('chat.type', model.properties?.type, WORD_LENGTH);

});
