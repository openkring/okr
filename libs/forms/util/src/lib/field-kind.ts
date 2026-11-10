import { Field, FieldType, FormMapping, ModelSelectField, ModelSelectFieldType } from '@okr/shared-models';
import { SSN_FIELD_KEY } from '@okr/shared-util-core';

/** A field key becomes a property name of the submitted document: camelCase — a lower-case letter, then letters and digits (e.g. firstName). */
export const FIELD_KEY_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/** Element types that only display content — they hold no value and are never submitted. */
export const DISPLAY_FIELD_TYPES: readonly FieldType[] = ['label', 'paragraph', 'divider'];

/** True for display-only elements (label, paragraph, divider). */
export function isDisplayField(type: FieldType): boolean {
  return DISPLAY_FIELD_TYPES.includes(type);
}

/** True for elements that collect a value (everything except display-only elements). */
export function isInputField(field: { type: FieldType }): boolean {
  return !isDisplayField(field.type);
}

/** The field types that pick a person, an organisation or a resource by name. */
export const MODEL_SELECT_FIELD_TYPES: readonly ModelSelectFieldType[] = ['person', 'org', 'resource'];

/** True for a person/org/resource picker. */
export function isModelSelectField(field: { type: FieldType }): field is ModelSelectField {
  return (MODEL_SELECT_FIELD_TYPES as readonly string[]).includes(field.type);
}

/** The distinct category-list names the 'category' fields of a form refer to. */
export function categoryNamesOf(fields: readonly Field[]): string[] {
  const names = fields.flatMap(f => (f.type === 'category' && f.categoryName ? [f.categoryName] : []));
  return [...new Set(names)];
}

/**
 * The keys used by more than one input field, in the order they first repeat. Display elements and
 * empty keys never count: the renderer builds one control per input key, so a repeated key would let
 * two questions share one answer. Shared by the settings suite and the form builder (spec 7.3).
 */
export function findDuplicateKeys(fields: readonly Field[] | undefined): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const field of fields ?? []) {
    if (!isInputField(field) || !field.key) continue;
    if (seen.has(field.key)) {
      if (!duplicates.includes(field.key)) duplicates.push(field.key);
    } else {
      seen.add(field.key);
    }
  }
  return duplicates;
}

/** The only model an AHV (`ssn`) field may be stored in: an application (`ApplicationModel.ssnId`). */
export const SSN_MODEL_TYPE = 'ApplicationModel';

/**
 * The keys of AHV (`ssn`) fields placed where an AHV number may not be stored: under any key but
 * `ssnId`, or on a form whose target is not an application mapping (a URL, a prospect, a
 * reservation). Shared by the settings suite and the form builder (privacy 1.19).
 */
export function misplacedSsnFields(fields: readonly Field[] | undefined, mapping: FormMapping | undefined): string[] {
  const allowedTarget = mapping?.modelType === SSN_MODEL_TYPE;
  return (fields ?? [])
    .filter(f => f.type === 'ssn' && (!allowedTarget || f.key !== SSN_FIELD_KEY))
    .map(f => f.key);
}
