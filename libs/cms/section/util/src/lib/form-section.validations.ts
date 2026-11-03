import { enforce, omitWhen, staticSuite, test } from 'vest';

import { FormSection, ImplicitField } from '@okr/shared-models';
import { coerceToPropertyType, isSectionOnlyImplicit, isSsnField, stringValidations } from '@okr/shared-util-core';
import { FORM_MESSAGE_MAX_LENGTH, isStoreDateOrEmpty, MAX_RESPONSES_LIMIT } from '@okr/forms-util';

import { baseSectionValidations } from './base-section.validations';

/** The same shape check the notification mail path applies to a recipient. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PFX = '@cms/section/feature.validation.';

/** Longest notification list the editor lets the author type (the addresses joined by «, »). */
export const FORM_EMAILS_MAX_LENGTH = 1000;

/** A fixed value that was left empty: `undefined`, `null` or `''` (the editor removes a cleared entry). */
function isUnset(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * Validates the settings of a form section (spec 1.125 B): the form, the notification addresses, the fixed
 * values of the chosen form's implicit fields and the page's own acceptance overrides.
 *
 * `implicitFields` are the implicit fields of the CHOSEN form, which the section itself does not hold; the
 * editor passes them through the registry context (`validateSection(model, { formImplicitFields })`). While
 * they are unknown (the forms not loaded yet, a form that is gone) only what the section holds is checked.
 *
 * Errors of a fixed value are filed under `implicitValues.<field key>`. The acceptance overrides use the
 * form builder's own message keys (`@forms/feature.accept.*`): one wording for the same rule.
 */
export const formSectionValidations = staticSuite((model: FormSection, implicitFields: ImplicitField[] = []) => {
  baseSectionValidations(model);

  const props = model.properties;
  const fields = Array.isArray(implicitFields) ? implicitFields : [];
  const values: Record<string, unknown> = props?.implicitValues ?? {};

  // `formKey` is chosen from a list: no length cap (a selector value, see building-forms rule 1)
  stringValidations('formKey', props?.formKey, undefined, 0, true);

  omitWhen(props?.emailAddresses === undefined || props?.emailAddresses === null, () => {
    test('emailAddresses', PFX + 'formEmailInvalid', () => {
      const list = props?.emailAddresses;
      enforce(Array.isArray(list) && list.every((address) => typeof address === 'string' && EMAIL.test(address.trim()))).isTruthy();
    });
    test('emailAddresses', 'tooLong', () => {
      const list = props?.emailAddresses;
      enforce(!Array.isArray(list) || list.join(', ').length <= FORM_EMAILS_MAX_LENGTH).isTruthy();
    });
  });

  // A fixed value must be one the field can hold; an AHV number is never one (R1: it would sit in clear text in the section).
  for (const [key, value] of Object.entries(values)) {
    const field = fields.find((f) => f.key === key);
    if (isSsnField({ key }) || isSsnField(field)) {
      test(`implicitValues.${key}`, PFX + 'formImplicitSsn', () => {
        enforce(false).isTruthy();
      });
    } else if (field !== undefined && !isUnset(value)) {
      test(`implicitValues.${key}`, PFX + 'formImplicitInvalid', () => {
        enforce(coerceToPropertyType(value, field.valueType) !== undefined).isTruthy();
      });
    }
  }

  // A value only the page can supply must be there: otherwise a verified section leaves the answer empty.
  for (const field of fields) {
    if (!isSectionOnlyImplicit(field)) continue;
    test(`implicitValues.${field.key}`, PFX + 'formImplicitRequired', () => {
      enforce(isUnset(values[field.key])).isFalsy();
    });
  }

  // Annahme (spec §11): an absent value inherits the form's
  omitWhen(props?.maxResponses === undefined || props?.maxResponses === null, () => {
    test('maxResponses', '@forms/feature.accept.max_invalid', () => {
      const max = props?.maxResponses;
      enforce(typeof max === 'number' && Number.isInteger(max) && max >= 0 && max <= MAX_RESPONSES_LIMIT).isTruthy();
    });
  });
  test('closesAt', '@forms/feature.accept.closes_invalid', () => {
    enforce(isStoreDateOrEmpty(props?.closesAt)).isTruthy();
  });
  stringValidations('closedMessage', props?.closedMessage ?? '', FORM_MESSAGE_MAX_LENGTH);
});
