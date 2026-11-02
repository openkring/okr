import type { DerivedValue, Field } from '@okr/shared-models';
import {
  buildTypedProperties,
  coerceToPropertyType,
  computeDerivedValues,
  getVisibleFieldIds,
  propertyTypeOf,
} from '@okr/shared-util-core';

/**
 * The server side of a form submission (1.125, spec §7.2): the definition decides what is
 * stored, never the client. Pure — no Firestore, no logger; `submitForm` does the throwing.
 *
 * Hidden means absent: a hidden field is not required, not validated and not stored. Keys that
 * are not an input field of the definition (honeypot, `_jsToken`, `personKey`, `reviewer`, …)
 * are dropped. Derived values overwrite whatever the client sent for the same key.
 */

export interface PreparedSubmission {
  values: Record<string, unknown>;
  /** Keys of visible required fields that are empty. */
  missingRequired: string[];
  /** Keys of visible `asProperty` fields whose answer does not coerce to the property type. */
  invalidProperties: string[];
  /** Keys of derived `asProperty` values that do not coerce to their type (admin-authored: logged, not rejected). */
  droppedDerivedProperties: string[];
  /** What the notification e-mail shows: visible answers in field order, then derived values. */
  rows: SubmissionRow[];
}

export interface SubmissionRow { label: string; value: string; }

const DISPLAY_TYPES: ReadonlySet<string> = new Set(['label', 'paragraph', 'divider']);

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function isSingleCheckbox(field: Field): boolean {
  return field.type === 'checkbox' && !(Array.isArray(field.options) && field.options.length > 0);
}

/** «ja»/«nein» for booleans, a comma list for arrays, «–» for nothing. */
function formatRowValue(field: Field | undefined, value: unknown): string {
  if (value === undefined || value === null || value === '') return '–';
  if (field !== undefined && propertyTypeOf(field) === 'boolean') {
    const b = coerceToPropertyType(value, 'boolean');
    if (b !== undefined) return b ? 'ja' : 'nein';
  }
  if (typeof value === 'boolean') return value ? 'ja' : 'nein';
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ');
  return String(value);
}

/**
 * The rows of the notification e-mail (pure): visible input fields in field order with their
 * answer (booleans as ja/nein), then every derived value labelled by its key. Hidden and display
 * fields are not shown.
 */
export function buildSubmissionRows(
  sortedVisibleInputs: Field[],
  answers: Record<string, unknown>,
  derivedValues: Record<string, string>,
): SubmissionRow[] {
  const rows: SubmissionRow[] = sortedVisibleInputs.map((f) => ({ label: f.label, value: formatRowValue(f, answers[f.key]) }));
  for (const [key, value] of Object.entries(derivedValues)) rows.push({ label: key, value: formatRowValue(undefined, value) });
  return rows;
}

export function prepareSubmission(
  fields: Field[],
  derived: DerivedValue[] | undefined,
  propertiesField: string | undefined,
  raw: Record<string, unknown>,
  today: string,
): PreparedSubmission {
  const defs = (Array.isArray(fields) ? fields : []).filter((f) => !DISPLAY_TYPES.has(f.type));
  const all = Array.isArray(fields) ? fields : [];
  const input = raw ?? {};
  const visible = getVisibleFieldIds(all, input, today);
  const sorted = [...defs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const missingRequired: string[] = [];
  const invalidProperties: string[] = [];
  const droppedDerivedProperties: string[] = [];
  const answers: Record<string, unknown> = {};

  for (const field of sorted) {
    if (!visible.has(field.id)) continue;
    const value = input[field.key];
    if (field.required && isEmpty(value)) missingRequired.push(field.key);
    if (value !== undefined) {
      answers[field.key] = value;
    } else if (isSingleCheckbox(field)) {
      // An unticked single checkbox may arrive as nothing at all: store the «nein», not a gap.
      answers[field.key] = false;
    }
  }

  // A derived property without a type is text: it must never fall back to a top-level key.
  const derivedList: DerivedValue[] = (Array.isArray(derived) ? derived : []).map((d) =>
    d?.asProperty === true && d.type === undefined ? { ...d, type: 'text' } : d,
  );
  const derivedValues = computeDerivedValues(derivedList, all, input, visible, today);
  const propsKey = typeof propertiesField === 'string' && propertiesField !== '' ? propertiesField : undefined;

  const values: Record<string, unknown> = {};
  for (const field of sorted) {
    if (!(field.key in answers)) continue;
    const propertyType = propertyTypeOf(field);
    const asProperty = propsKey !== undefined && field.asProperty === true && propertyType !== undefined;
    if (asProperty) {
      const answer = answers[field.key];
      if (!isEmpty(answer) && coerceToPropertyType(answer, propertyType) === undefined) {
        invalidProperties.push(field.key);
      }
      continue;
    }
    values[field.key] = answers[field.key];
  }

  for (const d of derivedList) {
    if (typeof d?.key !== 'string' || !(d.key in derivedValues)) continue;
    if (propsKey !== undefined && d.asProperty === true) {
      if (d.type !== undefined && coerceToPropertyType(derivedValues[d.key], d.type) === undefined) {
        droppedDerivedProperties.push(d.key);
      }
      continue;
    }
    values[d.key] = derivedValues[d.key];
  }

  if (propsKey !== undefined) {
    values[propsKey] = buildTypedProperties(all, answers, visible, derivedList, derivedValues);
  }

  const rows = buildSubmissionRows(sorted.filter((f) => visible.has(f.id)), answers, derivedValues);
  return { values, missingRequired, invalidProperties, droppedDerivedProperties, rows };
}
