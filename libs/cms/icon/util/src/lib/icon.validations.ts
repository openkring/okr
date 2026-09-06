import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { IconModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';
import { only, staticSuite } from 'vest';

export const iconValidations = staticSuite((model: IconModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('type', model.type, SHORT_NAME_LENGTH);
  // `index` is generated (get<Model>Index) and the service overwrites it at save time, AFTER
  // this suite runs — a cap here can only reject a value the user cannot see or edit, so the
  // form would just never offer its save bar. Left uncapped on purpose; see vest.util.
  stringValidations('index', model.index);
  stringValidations('fullPath', model.fullPath, DESCRIPTION_LENGTH);
});
