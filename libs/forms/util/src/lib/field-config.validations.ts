import { enforce, omitWhen, only, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { Field } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

import { isDisplayField } from './field-kind';

/** A field key becomes a property name of the submitted document: camelCase — a lower-case letter, then letters and digits (e.g. firstName). */
export const FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/** The cap on `label`: static text of a label element is prose, a field label is a short name. */
export function fieldLabelLength(field: Pick<Field, 'type'>): number {
  return field.type === 'label' ? DESCRIPTION_LENGTH : LONG_NAME_LENGTH;
}

/**
 * Validates one form-builder field as configured in the field-config modal.
 * Display elements (label, divider) carry no key; a divider carries no label either.
 */
export const fieldConfigValidations = staticSuite((model: Field, field?: string) => {
  if (field) only(field);

  omitWhen(model.type === 'divider', () => {
    stringValidations('label', model.label, fieldLabelLength(model), 0, true);
  });

  omitWhen(isDisplayField(model.type), () => {
    stringValidations('key', model.key, NAME_LENGTH, 0, true);
    omitWhen(!model.key, () => {
      test('key', '@forms/feature.field.key_invalid', () => {
        enforce(model.key).matches(FIELD_KEY_PATTERN);
      });
    });
    stringValidations('helpText', model.helpText ?? '', LONG_NAME_LENGTH);
    stringValidations('placeholder', model.placeholder ?? '', NAME_LENGTH);
  });

  omitWhen(model.type !== 'category', () => {
    stringValidations('categoryName', (model as { categoryName?: string }).categoryName ?? '', undefined, 0, true);
  });
});
