import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, NAME_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { stringValidations } from '@bk2/shared-util-core';

import { UserModelFormModel } from './user-model-form.model';

export const userModelFormValidations = staticSuite((model: UserModelFormModel, field?: string) => {
  only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('personKey', model.personKey, SHORT_NAME_LENGTH);
  stringValidations('firstName', model.firstName, NAME_LENGTH);
  stringValidations('lastName', model.lastName, NAME_LENGTH);
  stringValidations('loginEmail', model.loginEmail, SHORT_NAME_LENGTH);
  stringValidations('gravatarEmail', model.gravatarEmail, SHORT_NAME_LENGTH);

  // tbd: tenantValidations(model.tenants);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  stringValidations('tags', model.tags, DESCRIPTION_LENGTH);
});

