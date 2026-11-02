import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { Field } from '@okr/shared-models';
import { coerceToPropertyType, stringValidations } from '@okr/shared-util-core';

import { FIELD_KEY_PATTERN, isDisplayField } from './field-kind';
import { canAllowOther } from './form-prefill-link.util';
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
const VALUE_TYPES = ['boolean', 'number', 'text'];

/**
 * `mappingKey` (optional) is the form's collection mapping: «Andere …» is refused on a typed choice key of it
 * (`gender`); `formDefinitionValidations` checks the same against the whole form.
 */
export const fieldConfigValidations = staticSuite((model: Field, mappingKey?: string) => {
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

  // an unsichtbares Feld (spec §8.1): the type of its value, and a default that fits it
  omitWhen(model.type !== 'implicit', () => {
    const { valueType, defaultValue } = model as { valueType?: string; defaultValue?: unknown };
    test('valueType', 'required', () => {
      enforce(VALUE_TYPES.includes(valueType as string)).isTruthy();
    });
    omitWhen(defaultValue === undefined || defaultValue === null || defaultValue === '' || !VALUE_TYPES.includes(valueType as string), () => {
      test('defaultValue', '@forms/feature.field.default_invalid', () => {
        enforce(coerceToPropertyType(defaultValue, valueType as 'boolean' | 'number' | 'text') !== undefined).isTruthy();
      });
    });
  });

  // «Andere …» (spec §9) only where a closed list of options can take it
  omitWhen((model as { allowOther?: boolean }).allowOther !== true, () => {
    test('allowOther', '@forms/feature.field.allow_other_blocked', () => {
      enforce(canAllowOther(model, mappingKey)).isTruthy();
    });
  });

  omitWhen(model.type !== 'category', () => {
    stringValidations('categoryName', (model as { categoryName?: string }).categoryName ?? '', undefined, 0, true);
  });

  omitWhen(!model.visibleIf, () => {
    ruleTests('visibleIf', model.visibleIf);
  });
});
