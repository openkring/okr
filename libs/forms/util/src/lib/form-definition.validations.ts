import { enforce, omitWhen, staticSuite, test } from 'vest';

import { DESCRIPTION_LENGTH, LONG_NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';
import { FormDefinitionModel } from '@okr/shared-models';
import { classifyStoreDate, isValidPartialStoreDate, stringValidations } from '@okr/shared-util-core';

import { findDuplicateKeys, misplacedSsnFields } from './field-kind';
import { getFormMapping } from './form-mappings';
import { canAllowOther, FORM_MESSAGE_MAX_LENGTH, firstEmailField } from './form-prefill-link.util';
import { ruleTests } from './form-rules.validations';

export const MAX_RESPONSES_LIMIT = 10000;

/** `''` (no date) or a real calendar day as `yyyymmdd`. */
function isStoreDateOrEmpty(value: unknown): boolean {
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

  // «Andere …» stores its text under `<key>Other`: no other question may use that key (it would overwrite or be overwritten)
  test('fields', '@forms/feature.fields.other_key_clash', () => {
    const fields = Array.isArray(model.fields) ? model.fields : [];
    const keys = new Set(fields.filter(f => !!f?.key).map(f => f.key));
    const clash = fields.some(f => (f as { allowOther?: boolean }).allowOther === true && !!f.key && keys.has(`${f.key}Other`));
    enforce(clash).isFalsy();
  });

  // …and not on a question stored in a typed model field (`gender`): `other` would write a value the model does not allow
  test('fields', '@forms/feature.fields.other_not_allowed', () => {
    const mappingKey = model.target?.kind === 'collection' ? model.target.mappingKey : undefined;
    const bad = (Array.isArray(model.fields) ? model.fields : []).some(f => (f as { allowOther?: boolean }).allowOther === true && !canAllowOther(f, mappingKey));
    enforce(bad).isFalsy();
  });

  // Nach dem Absenden (spec §10)
  stringValidations('confirmationMessage', model.confirmationMessage ?? '', FORM_MESSAGE_MAX_LENGTH);
  (Array.isArray(model.confirmationVariants) ? model.confirmationVariants : []).forEach((variant, i) => {
    const at = `confirmationVariants.${i}`;
    ruleTests(`${at}.when`, variant?.when);
    stringValidations(`${at}.message`, variant?.message ?? '', FORM_MESSAGE_MAX_LENGTH, 0, true);
  });
  omitWhen(model.sendFillerConfirmation !== true, () => {
    test('sendFillerConfirmation', '@forms/feature.after.mail_needs_email', () => {
      enforce(firstEmailField(model.fields) !== undefined).isTruthy();
    });
  });

  // Annahme (spec §11): a missing value is a legacy definition and means «open, no date, unlimited»
  omitWhen(model.maxResponses === undefined, () => {
    test('maxResponses', '@forms/feature.accept.max_invalid', () => {
      enforce(typeof model.maxResponses === 'number' && Number.isInteger(model.maxResponses) && model.maxResponses >= 0 && model.maxResponses <= MAX_RESPONSES_LIMIT).isTruthy();
    });
  });
  test('closesAt', '@forms/feature.accept.closes_invalid', () => {
    enforce(isStoreDateOrEmpty(model.closesAt)).isTruthy();
  });
  stringValidations('closedMessage', model.closedMessage ?? '', FORM_MESSAGE_MAX_LENGTH);
});
