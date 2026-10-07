
import { IconModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';
import { staticSuite } from 'vest';

export const iconValidations = staticSuite((model: IconModel, tenants: string, tags: string) => {
  baseValidations(model, tenants, tags);
  stringValidations('type', model.type);
  // `index` is generated (get<Model>Index) and the service overwrites it at save time, AFTER
  // this suite runs — a cap here can only reject a value the user cannot see or edit, so the
  // form would just never offer its save bar. Left uncapped on purpose; see vest.util.
  stringValidations('index', model.index);
  stringValidations('fullPath', model.fullPath);
});
