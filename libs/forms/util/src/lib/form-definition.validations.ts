import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { DerivedValue, Field, FormDefinitionModel } from '@okr/shared-models';
import { classifyStoreDate, isValidPartialStoreDate, stringValidations } from '@okr/shared-util-core';

import { findDuplicateKeys, isInputField, misplacedSsnFields } from './field-kind';
import { getFormMapping } from './form-mappings';
import {
  fieldsBlockingOther, FORM_MESSAGE_MAX_LENGTH, firstEmailField, implicitSsnFields, otherKeyClashes,
} from './form-prefill-link.util';
import { controllerTests, ruleTests } from './form-rules.validations';

export const MAX_RESPONSES_LIMIT = 10000;

/** The only mappings a `course` field may sit on (spec 1.152 A8): the membership applications. */
export const COURSE_FIELD_MAPPINGS: readonly string[] = ['applications.default', 'applications.junior'];

export type CourseFieldIssue = 'once' | 'mapping' | 'audience';

/**
 * What is wrong with the `course` field(s) of a form (1.152): more than one, a mapping other than the membership
 * ones (a mail or url target has none), or an `audienceFrom` that names no derived value. Empty without a course
 * field. Shared by `formDefinitionValidations` and the builder's save gate.
 */
export function courseFieldIssues(
  fields: readonly Field[] | undefined, mappingKey: string | undefined, derivedValues: readonly DerivedValue[] | undefined,
): CourseFieldIssue[] {
  const courseFields = (Array.isArray(fields) ? fields : []).filter(f => f?.type === 'course');
  if (courseFields.length === 0) return [];
  const derivedKeys = (Array.isArray(derivedValues) ? derivedValues : []).map(d => d?.key);
  const issues: CourseFieldIssue[] = [];
  if (courseFields.length > 1) issues.push('once');
  if (!COURSE_FIELD_MAPPINGS.includes(mappingKey ?? '')) issues.push('mapping');
  if (!courseFields.every(f => derivedKeys.includes((f as { audienceFrom?: string }).audienceFrom ?? ''))) issues.push('audience');
  return issues;
}

/**
 * The «Annahme» settings (spec §11): on a form definition, and — as overrides — on a form section, where an
 * empty value means «wie im Formular». Edited by `AcceptanceSettingsInput`.
 */
export type AcceptanceFields = Pick<FormDefinitionModel, 'isOpen' | 'closesAt' | 'maxResponses' | 'showRemaining' | 'closedMessage'>;

/** `''` (no date) or a real calendar day as `yyyymmdd`. */
export function isStoreDateOrEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  return typeof value === 'string' && /^\d{8}$/.test(value) && classifyStoreDate(value) === 'full' && isValidPartialStoreDate(value);
}

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

  // An AHV number is stored only as `ssnId` of an application (privacy 1.19).
  test('fields', '@forms/feature.fields.ssn_placement', () => {
    const mapping = model.target?.kind === 'collection' ? getFormMapping(model.target.mappingKey) : undefined;
    enforce(misplacedSsnFields(model.fields, mapping).length).equals(0);
  });

  // an AHV number is never an implicit value: it would sit in clear text in the definition (R1; pasted JSON too)
  test('fields', '@forms/feature.fields.implicit_ssn', () => {
    enforce(implicitSsnFields(model.fields).length).equals(0);
  });

  // «Andere …» stores its text under `<key>Other`: no other question or derived value may use that key (it would overwrite or be overwritten)
  test('fields', '@forms/feature.fields.other_key_clash', () => {
    enforce(otherKeyClashes(model.fields, model.derivedValues).length).equals(0);
  });

  // …and not on a question stored in a typed model field (`gender`): `other` would write a value the model does not allow
  test('fields', '@forms/feature.fields.other_not_allowed', () => {
    const mappingKey = model.target?.kind === 'collection' ? model.target.mappingKey : undefined;
    enforce(fieldsBlockingOther(model.fields, mappingKey).length).equals(0);
  });

  // the course choice (1.152): one per form, on the membership mappings only, and its audience must be a derived value
  const courseIssues = courseFieldIssues(model.fields, model.target?.kind === 'collection' ? model.target.mappingKey : undefined, model.derivedValues);
  test('fields', '@forms/feature.fields.course_field_once', () => {
    enforce(courseIssues.includes('once')).isFalsy();
  });
  test('fields', '@forms/feature.fields.course_field_mapping', () => {
    enforce(courseIssues.includes('mapping')).isFalsy();
  });
  test('fields', '@forms/feature.fields.course_audience_from_missing', () => {
    enforce(courseIssues.includes('audience')).isFalsy();
  });

  // Nach dem Absenden (spec §10)
  stringValidations('confirmationMessage', model.confirmationMessage ?? '', FORM_MESSAGE_MAX_LENGTH);
  const inputFields = (Array.isArray(model.fields) ? model.fields : []).filter(isInputField);
  (Array.isArray(model.confirmationVariants) ? model.confirmationVariants : []).forEach((variant, i) => {
    const at = `confirmationVariants.${i}`;
    ruleTests(`${at}.when`, variant?.when);
    // the controller must still exist and still offer the operator (a deleted or retyped field would count as true)
    (variant?.when?.conditions ?? []).forEach((cond, k) => controllerTests(`${at}.when.conditions.${k}`, cond, inputFields));
    stringValidations(`${at}.message`, variant?.message ?? '', FORM_MESSAGE_MAX_LENGTH, 0, true);
  });
  omitWhen(model.sendFillerConfirmation !== true, () => {
    test('sendFillerConfirmation', '@forms/feature.after.mail_needs_email', () => {
      enforce(firstEmailField(model.fields) !== undefined).isTruthy();
    });
  });

  // Annahme (spec §11): a missing value is a legacy definition and means «open, no date, unlimited»
  omitWhen(model.maxResponses === undefined || model.maxResponses === null, () => {
    test('maxResponses', '@forms/feature.accept.max_invalid', () => {
      enforce(typeof model.maxResponses === 'number' && Number.isInteger(model.maxResponses) && model.maxResponses >= 0 && model.maxResponses <= MAX_RESPONSES_LIMIT).isTruthy();
    });
  });
  test('closesAt', '@forms/feature.accept.closes_invalid', () => {
    enforce(isStoreDateOrEmpty(model.closesAt)).isTruthy();
  });
  stringValidations('closedMessage', model.closedMessage ?? '', FORM_MESSAGE_MAX_LENGTH);
});
