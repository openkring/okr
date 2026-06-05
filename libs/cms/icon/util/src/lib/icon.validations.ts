import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { IconModel } from '@bk2/shared-models';
import { baseValidations, stringValidations } from '@bk2/shared-util-core';
import { only, staticSuite } from 'vest';

export const iconValidations = staticSuite((model: IconModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('type', model.type, SHORT_NAME_LENGTH);
  stringValidations('index', model.index, DESCRIPTION_LENGTH);
  stringValidations('fullPath', model.fullPath, DESCRIPTION_LENGTH);
});
