import { DerivedValue, Field } from '@okr/shared-models';
import { isPrefillable, isSsnField, parsePrefillValue } from '@okr/shared-util-core';

import { templateChoiceKeys } from './form-field-templates';

/** The cap on the free texts a form author writes for the filler: confirmation, variants, closed text. Bound to `[maxLength]` in the settings. */
export const FORM_MESSAGE_MAX_LENGTH = 2000;

/** A key that stores a person's name or similar: `firstName`, `lastName`, `name`, `surname`. */
const NAME_KEY = /[nN]ame$/;
const PERSONAL_TYPES: readonly string[] = ['email', 'phone', 'date'];

/** The query-parameter text of one answer; `undefined` for an empty one (and for an unticked checkbox: that is the default). */
function serialize(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() === '' ? undefined : value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean') return value ? 'true' : undefined;
  if (Array.isArray(value)) {
    const parts = value.filter((v): v is string => typeof v === 'string' && v !== '');
    return parts.length > 0 ? parts.join(',') : undefined;
  }
  return undefined;
}

/**
 * The query string (without `?`) of a pre-filled link for the answers in the builder's preview (spec §8):
 * one parameter per pre-fillable field with a non-empty answer, in form order. Only values the public form
 * would accept (`parsePrefillValue`) are written, so a link never carries something the page ignores.
 * Never an AHV field (R1), never a password, IBAN, file, image, signature or avatar.
 * `hasPersonalData` is true when an e-mail, phone, date (a date of birth included) or a name is part of it:
 * such a link should go only to that person.
 */
export function buildPrefillQuery(fields: Field[], values: Record<string, unknown>): { query: string; hasPersonalData: boolean } {
  const params = new URLSearchParams();
  let hasPersonalData = false;
  if (!Array.isArray(fields) || typeof values !== 'object' || values === null) return { query: '', hasPersonalData };

  for (const field of fields) {
    const key = field?.key;
    if (typeof key !== 'string' || key === '' || params.has(key) || !isPrefillable(field)) continue;
    if (!Object.prototype.hasOwnProperty.call(values, key)) continue;
    const raw = serialize(values[key]);
    if (raw === undefined || parsePrefillValue(field, raw) === undefined) continue;
    params.set(key, raw);
    if (PERSONAL_TYPES.includes(field.type) || NAME_KEY.test(key) || key === 'dateOfBirth') hasPersonalData = true;
  }
  return { query: params.toString(), hasPersonalData };
}

/**
 * Whether a field key is a typed choice of the mapping (`gender`, `applicationAs`): its value is written onto a
 * model field with a closed set, so «Andere …» (the value `other`) would store something the model does not allow.
 */
export function isTypedChoiceKey(mappingKey: string | undefined, key: string): boolean {
  return templateChoiceKeys(mappingKey).includes(key);
}

/**
 * Whether «Andere …» may be switched on (spec §9): a dropdown, a radio or a checkbox with options, that is
 * neither an AHV field (R1) nor an implicit one nor mapped onto a typed model field.
 */
export function canAllowOther(field: Field, mappingKey: string | undefined): boolean {
  if (!field || isSsnField(field)) return false;
  const hasOptions = field.type === 'dropdown' || field.type === 'radio' || (field.type === 'checkbox' && (field.options?.length ?? 0) > 0);
  return hasOptions && !isTypedChoiceKey(mappingKey, field.key);
}

/**
 * Fields with «Andere …» switched on where it is not allowed (spec §9): not a choice field with options, an AHV field,
 * or a typed choice key of the mapping (`gender`). Shared by `formDefinitionValidations` and the builder's save gate.
 */
export function fieldsBlockingOther(fields: Field[], mappingKey: string | undefined): Field[] {
  return (Array.isArray(fields) ? fields : [])
    .filter(f => (f as { allowOther?: boolean } | undefined)?.allowOther === true && !canAllowOther(f, mappingKey));
}

/**
 * Fields with «Andere …» whose text key `<key>Other` is already the key of another question or a derived value:
 * the two answers would overwrite each other. Shared by `formDefinitionValidations` and the builder's save gate.
 */
export function otherKeyClashes(fields: Field[], derivedValues: DerivedValue[] | undefined): Field[] {
  const list = Array.isArray(fields) ? fields : [];
  const derived = Array.isArray(derivedValues) ? derivedValues : [];
  const keys = new Set([...list.map(f => f?.key), ...derived.map(d => d?.key)].filter((k): k is string => !!k));
  return list.filter(f => (f as { allowOther?: boolean } | undefined)?.allowOther === true && !!f.key && keys.has(`${f.key}Other`));
}

/**
 * Implicit fields that are AHV fields (R1): their value would sit in clear text in the definition or a section.
 * Shared by `formDefinitionValidations` and the builder's save gate.
 */
export function implicitSsnFields(fields: Field[]): Field[] {
  return (Array.isArray(fields) ? fields : []).filter(f => f?.type === 'implicit' && isSsnField(f));
}

/** The first e-mail field in form order, the one «Bestätigung per E-Mail senden» writes to (never an AHV field). */
export function firstEmailField(fields: Field[]): Field | undefined {
  return [...(Array.isArray(fields) ? fields : [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .find(f => f?.type === 'email' && !isSsnField(f));
}
