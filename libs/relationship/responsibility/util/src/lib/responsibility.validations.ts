import { staticSuite } from 'vest';

import { ResponsibilityModel } from '@okr/shared-models';
import { avatarValidations, baseValidations, dateValidations, stringValidations } from '@okr/shared-util-core';

export const responsibilityValidations = staticSuite((model: ResponsibilityModel, tenants: string) => {

  baseValidations(model, tenants, '');

  avatarValidations('responsibleAvatar', model.responsibleAvatar);
  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo);

  if (model.delegateAvatar) {
    avatarValidations('delegateAvatar', model.delegateAvatar);
    dateValidations('delegateValidFrom', model.delegateValidFrom);
    dateValidations('delegateValidTo', model.delegateValidTo);
  }
});
