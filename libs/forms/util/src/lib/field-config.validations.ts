import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { Field } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';

import { FIELD_KEY_PATTERN, isDisplayField } from './field-kind';
import { ruleTests } from './form-rules.validations';

/** The cap on `label`: the static text of a label or paragraph element is prose, a field label is a short name. */
export function fieldLabelLength(field: Pick<Field, 'type'>): number {
  return field.type === 'label' || field.type === 'paragraph' ? DESCRIPTION_LENGTH : LONG_NAME_LENGTH;
}

/**
 * Validates one form-builder field as configured in the field-config modal.
 * Display elements (label, divider) carry no key; a divider carries no label either.
 * A «Nur anzeigen, wenn …» rule, when set, is validated under `visibleIf.conditions.<i>.…`.
 */
export const fieldConfigValidations = staticSuite((model: Field) => {
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

  omitWhen(!model.visibleIf, () => {
    ruleTests('visibleIf', model.visibleIf);
  });
});
