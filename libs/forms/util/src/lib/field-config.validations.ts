import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, NAME_LENGTH } from '@okr/shared-constants';
import { BaseType, Field, PropertyType } from '@okr/shared-models';
import { coerceToPropertyType, isSsnField, stringValidations } from '@okr/shared-util-core';

import { FIELD_KEY_PATTERN, isDisplayField } from './field-kind';
import { canAllowOther } from './form-prefill-link.util';
import { ruleTests } from './form-rules.validations';

/** The cap on `label`: the static text of a label or paragraph element is prose, a field label is a short name. */
export function fieldLabelLength(field: Pick<Field, 'type'>): number {
  return field.type === 'label' || field.type === 'paragraph' ? DESCRIPTION_LENGTH : LONG_NAME_LENGTH;
}

const VALUE_TYPES = ['boolean', 'number', 'text'];

/** What a typed default of an unsichtbares Feld does to the stored default. */
export type DefaultFromText = { action: 'keep' } | { action: 'remove' } | { action: 'set'; value: BaseType };

/**
 * The stored default for a text the author typed (spec §8.1). Blank → `remove`. A number type stores the number as
 * soon as the text coerces to one (`01` → 1, `1e3` → 1000, `.5` → 0.5) and keeps the stored one while the text still
 * means the same number (`1.`, `1.50` on the way to `1.05`); a text that is no number (`-`, `abc`) is stored as typed,
 * so the suite says it does not fit. A boolean type stores `true`/`false` texts as booleans, a text type the text.
 * The builder keeps showing what was typed in every case.
 */
export function defaultFromText(valueType: PropertyType, text: string, current: BaseType | undefined): DefaultFromText {
  if (typeof text !== 'string' || text.trim() === '') return { action: 'remove' };
  if (valueType === 'number' || valueType === 'boolean') {
    const coerced = coerceToPropertyType(text, valueType);
    if (coerced === undefined) return { action: 'set', value: text };
    return coerced === current ? { action: 'keep' } : { action: 'set', value: coerced };
  }
  return text === current ? { action: 'keep' } : { action: 'set', value: text };
}

/**
 * Validates one form-builder field as configured in the field-config modal.
 * Display elements (label, divider) carry no key; a divider carries no label either.
 * A «Nur anzeigen, wenn …» rule, when set, is validated under `visibleIf.conditions.<i>.…`.
 */
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
    // an unsichtbares Feld shows neither (the builder hides both), so a pasted value cannot block saving unseen
    omitWhen(model.type === 'implicit', () => {
      stringValidations('helpText', model.helpText ?? '', LONG_NAME_LENGTH);
      stringValidations('placeholder', model.placeholder ?? '', NAME_LENGTH);
    });
  });

  // an unsichtbares Feld (spec §8.1): the type of its value, and a default that fits it
  omitWhen(model.type !== 'implicit', () => {
    // an AHV number must never become a value in the definition or a section (R1)
    test('key', '@forms/feature.fields.implicit_ssn', () => {
      enforce(isSsnField(model)).isFalsy();
    });
    const { valueType, defaultValue } = model as { valueType?: string; defaultValue?: unknown };
    test('valueType', 'required', () => {
      enforce(VALUE_TYPES.includes(valueType as string)).isTruthy();
    });
    omitWhen(defaultValue === undefined || defaultValue === null || defaultValue === '' || !VALUE_TYPES.includes(valueType as string), () => {
      test('defaultValue', '@forms/feature.field.default_invalid', () => {
        enforce(coerceToPropertyType(defaultValue, valueType as 'boolean' | 'number' | 'text') !== undefined).isTruthy();
      });
    });
    // a text default is typed by the author: the same cap as the builder's input
    omitWhen(valueType !== 'text' || typeof defaultValue !== 'string', () => {
      stringValidations('defaultValue', defaultValue as string, LONG_NAME_LENGTH);
    });
  });

  // «Andere …» (spec §9) only where a closed list of options can take it
  omitWhen((model as { allowOther?: boolean }).allowOther !== true, () => {
    test('allowOther', '@forms/feature.field.allow_other_blocked', () => {
      enforce(canAllowOther(model, mappingKey)).isTruthy();
    });
  });

  // the course choice (1.152): the derived value that holds the applicant type; «Andere …» is never offered
  omitWhen(model.type !== 'course', () => {
    stringValidations('audienceFrom', (model as { audienceFrom?: string }).audienceFrom ?? '', NAME_LENGTH, 0, true);
  });

  omitWhen(model.type !== 'category', () => {
    stringValidations('categoryName', (model as { categoryName?: string }).categoryName ?? '', undefined, 0, true);
  });

  // an unsichtbares Feld is never shown, so the builder hides its rule editor and the rule is not checked
  omitWhen(!model.visibleIf || model.type === 'implicit', () => {
    ruleTests('visibleIf', model.visibleIf);
  });
});
