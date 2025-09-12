import { only, staticSuite } from 'vest';

import { booleanValidations, roleValidations } from '@bk2/shared-util-core';

import { UserAuthFormModel } from './user-auth-form.model';

export const userAuthFormValidations = staticSuite((model: UserAuthFormModel, field?: string) => {
  only(field);

  booleanValidations('useFaceId', model.useFaceId);
  booleanValidations('useTouchId', model.useTouchId);
  roleValidations('roles', model.roles);
});
