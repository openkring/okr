import { staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, EMAIL_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { stringValidations } from '@okr/shared-util-core';

import { UserModelFormModel } from './user-model-form.model';

export const userModelFormValidations = staticSuite((model: UserModelFormModel) => {
  stringValidations('okey', model.okey);
  stringValidations('personKey', model.personKey);
  stringValidations('firstName', model.firstName, NAME_LENGTH);
  stringValidations('lastName', model.lastName, NAME_LENGTH);
  stringValidations('loginEmail', model.loginEmail, EMAIL_LENGTH);
  stringValidations('gravatarEmail', model.gravatarEmail, EMAIL_LENGTH);

  // tbd: tenantValidations(model.tenants);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
  stringValidations('tags', model.tags, DESCRIPTION_LENGTH);
});

