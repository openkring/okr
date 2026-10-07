import { omitWhen, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { FormDefinitionModel } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

/**
 * Validates the settings of a form definition (form-definition edit modal):
 * a name, plus the submission target — a chosen collection mapping or a non-blank URL.
 * The field list is edited in the form builder and not validated here.
 */
export const formDefinitionValidations = staticSuite((model: FormDefinitionModel) => {
  stringValidations('name', model.name, LONG_NAME_LENGTH, 0, true);
  stringValidations('description', model.description ?? '', DESCRIPTION_LENGTH);

  omitWhen(model.target?.kind !== 'collection', () => {
    stringValidations('target.mappingKey', (model.target as { mappingKey?: string }).mappingKey ?? '', undefined, 0, true);
  });
  omitWhen(model.target?.kind !== 'url', () => {
    stringValidations('target.url', (model.target as { url?: string }).url ?? '', URL_LENGTH, 0, true);
  });
});
