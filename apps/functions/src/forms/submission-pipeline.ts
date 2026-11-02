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
}

const DISPLAY_TYPES: ReadonlySet<string> = new Set(['label', 'paragraph', 'divider']);

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function isSingleCheckbox(field: Field): boolean {
  return field.type === 'checkbox' && !(Array.isArray(field.options) && field.options.length > 0);
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

  const derivedValues = computeDerivedValues(derived, all, input, visible, today);
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

  for (const d of Array.isArray(derived) ? derived : []) {
    if (typeof d?.key !== 'string' || !(d.key in derivedValues)) continue;
    if (propsKey !== undefined && d.asProperty === true && d.type !== undefined) continue;
    values[d.key] = derivedValues[d.key];
  }

  if (propsKey !== undefined) {
    values[propsKey] = buildTypedProperties(all, answers, visible, derived, derivedValues);
  }

  return { values, missingRequired, invalidProperties };
}
