import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { ColorIonic } from '@bk2/shared-models';
import { categoryValidations, stringValidations } from '@bk2/shared-util-core';

import { SectionFormModel } from './section-form.model';

export const sectionFormValidations = staticSuite((model: SectionFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.bkey, SHORT_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  stringValidations('roleNeeded', model.roleNeeded, WORD_LENGTH);
  categoryValidations('color', model.color, ColorIonic);
  stringValidations('title', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('subTitle', model.bkey, SHORT_NAME_LENGTH);
});
