import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH, WORD_LENGTH } from '@okr/shared-constants';
import { ResponsibilityModel } from '@okr/shared-models';
import { avatarValidations, baseValidations, dateValidations, stringValidations } from '@okr/shared-util-core';

export const responsibilityValidations = staticSuite((model: ResponsibilityModel, tenants: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, '', field);

  avatarValidations('responsibleAvatar', model.responsibleAvatar);
  dateValidations('validFrom', model.validFrom);
  dateValidations('validTo', model.validTo);

  if (model.delegateAvatar) {
    avatarValidations('delegateAvatar', model.delegateAvatar);
    dateValidations('delegateValidFrom', model.delegateValidFrom);
    dateValidations('delegateValidTo', model.delegateValidTo);
  }
});
