import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { FormDefinitionModel } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

import { findDuplicateKeys } from './field-kind';

/**
 * Validates the settings of a form definition (form-definition edit modal):
 * a name, plus the submission target — a chosen collection mapping or a non-blank URL.
 * The fields are edited in the form builder and validated there one by one; here only what spans
 * several fields is checked: input fields must have distinct keys (the renderer builds one control per key).
 */
export const formDefinitionValidations = staticSuite((model: FormDefinitionModel) => {
  stringValidations('name', model.name, LONG_NAME_LENGTH, 0, true);
  stringValidations('description', model.description ?? '', DESCRIPTION_LENGTH);
  stringValidations('fillerHelpText', model.fillerHelpText ?? '', DESCRIPTION_LENGTH);

  omitWhen(model.target?.kind !== 'collection', () => {
    stringValidations('target.mappingKey', (model.target as { mappingKey?: string }).mappingKey ?? '', undefined, 0, true);
  });
  omitWhen(model.target?.kind !== 'url', () => {
    stringValidations('target.url', (model.target as { url?: string }).url ?? '', URL_LENGTH, 0, true);
  });

  test('fields', '@forms/feature.fields.duplicate_key', () => {
    enforce(findDuplicateKeys(model.fields).length).equals(0);
  });
});
