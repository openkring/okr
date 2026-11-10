import { OTHER_OPTION_VALUE } from '@okr/shared-models';
import type { BaseType, DerivedValue, Field, PropertyType, TypedProperty } from '@okr/shared-models';
import { isBlankAhv, isSsnField, SSN_FIELD_KEY } from './ahv.util';
import { evaluateVisibilityRule } from './form-visibility.util';

/**
 * Derived values and typed properties of a form submission (1.125, spec §4.4 and §6).
 *
 * Pure and deterministic: no Angular, no clock (the caller passes `today`), no I/O. Shared by the
 * `submitForm` Cloud Function (authoritative) and the builder preview. `values` is keyed by field
 * `key`; `visible` is the set of visible field ids from `getVisibleFieldIds`.
 */

/**
 * Computes the values the filler does not type. The first case whose rule holds wins; when none
 * does, `otherwise` applies; without `otherwise` the key is absent. A case may reference ANY input
 * field (not only earlier ones); a hidden controller reads as empty. A case whose rule has no
 * conditions always holds (same as an empty visibility rule).
 */
export function computeDerivedValues(
  derived: DerivedValue[] | undefined,
  fields: Field[],
  values: Record<string, unknown>,
  visible: Set<string>,
  today: string,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(derived)) return result;

  for (const d of derived) {
    if (typeof d !== 'object' || d === null || typeof d.key !== 'string') continue;
    const match = (Array.isArray(d.cases) ? d.cases : []).find((c) => evaluateVisibilityRule(c?.when, fields, values, visible, today));
    const value = match !== undefined ? match.value : d.otherwise;
    if (value !== undefined) result[d.key] = value;
  }
  return result;
}

/** The property type a field's answer is stored as, or `undefined` when the field cannot be a property. */
export function propertyTypeOf(field: Field): PropertyType | undefined {
  // an AHV number maps to the model field `ssnId`, never to a typed property — also a text field keyed ssnId
  if (isSsnField(field)) return undefined;
  switch (field.type) {
    case 'implicit':
      return field.valueType;
    case 'checkbox':
      return Array.isArray(field.options) && field.options.length > 0 ? undefined : 'boolean';
    case 'number':
    case 'rating':
      return 'number';
    case 'text':
    case 'dropdown':
    case 'radio':
    case 'category':
    case 'date':
    case 'email':
    case 'phone':
      return 'text';
    case 'course': // written to `courseKey` (+ `courseState`) by the server, never a property
    default:
      return undefined;
  }
}

/** Coerces an answer to the property type (`'true'` -> `true`, `'3'` -> `3`); `undefined` when it does not coerce. */
export function coerceToPropertyType(value: unknown, type: PropertyType): BaseType | undefined {
  switch (type) {
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return undefined;
    case 'number': {
      if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
      if (typeof value === 'string' && value.trim() !== '') {
        const n = Number(value);
        return Number.isFinite(n) ? n : undefined;
      }
      return undefined;
    }
    case 'text':
      if (typeof value === 'string') return value;
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
      return undefined;
    default:
      return undefined;
  }
}

/** Longest «Andere» text a submission may carry; a longer one is omitted here and refused by the server. */
export const FORM_OTHER_TEXT_MAX = 500;

/** The answer picks «Andere»: the reserved value, or a list holding it (checkbox group). */
function isOtherAnswer(field: Field, raw: unknown): boolean {
  if (!('allowOther' in field) || field.allowOther !== true) return false;
  return Array.isArray(raw) ? raw.includes(OTHER_OPTION_VALUE) : raw === OTHER_OPTION_VALUE;
}

/**
 * Builds the typed `properties` list: the visible `asProperty` fields in field `order` (label = the
 * field's label, value coerced to the field's type), followed by the derived values flagged
 * `asProperty` (label = their key). Unanswered fields (undefined, null, '') and values that do not
 * coerce are omitted; an explicit `false` is kept. Tolerates legacy input (no `derived`, no
 * `asProperty`).
 */
export function buildTypedProperties(
  fields: Field[],
  values: Record<string, unknown>,
  visible: Set<string>,
  derived: DerivedValue[] | undefined,
  derivedValues: Record<string, string>,
): TypedProperty[] {
  const list: TypedProperty[] = [];

  const sorted = [...(fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const field of sorted) {
    if (field.asProperty !== true || !visible.has(field.id)) continue;
    const type = propertyTypeOf(field);
    if (type === undefined) continue;
    const raw = values?.[field.key];
    if (raw === undefined || raw === null || raw === '') continue;
    const value = coerceToPropertyType(raw, type);
    if (value === undefined) continue;
    list.push({ key: field.key, type, value, label: field.label });

    // «Andere»: the free text goes next to the answer as `<key>Other` (spec §9)
    // never when a real field of the form owns that key (its answer is not an «Andere» text), never when too long
    const otherKey = `${field.key}Other`;
    const otherText = values?.[otherKey];
    if (
      isOtherAnswer(field, raw) &&
      !sorted.some((x) => x.key === otherKey) &&
      typeof otherText === 'string' &&
      otherText.trim() !== '' &&
      otherText.length <= FORM_OTHER_TEXT_MAX
    ) {
      list.push({ key: otherKey, type: 'text', value: otherText, label: `${field.label} (Andere)` });
    }
  }

  for (const d of Array.isArray(derived) ? derived : []) {
    if (d?.asProperty !== true || d.type === undefined) continue;
    const raw = derivedValues?.[d.key];
    if (raw === undefined) continue;
    const value = coerceToPropertyType(raw, d.type);
    if (value === undefined) continue;
    list.push({ key: d.key, type: d.type, value, label: d.key });
  }
  return list;
}

// ──────────────────────────────────────────
// AHV answers (`ssn` fields) — they never leave the target record (privacy 1.19)
// ──────────────────────────────────────────

/** The keys of a form's AHV fields (`isSsnField`: type `ssn`, or any field keyed `ssnId`). */
export function ssnFieldKeys(fields: readonly Field[] | undefined): Set<string> {
  return new Set((Array.isArray(fields) ? fields : []).filter((f) => isSsnField(f) && typeof f.key === 'string').map((f) => f.key));
}

/**
 * A copy of `values` without the answers of the form's AHV fields — for everything a submission
 * feeds besides its target record: a task note, a workflow event, an external URL, a prospect or
 * reservation built from named keys. An AHV number is vault data and may not be copied there.
 */
export function omitSsnValues(fields: readonly Field[] | undefined, values: Record<string, unknown>): Record<string, unknown> {
  // `ssnId` always goes, whatever the form asks: a whole stored record (e.g. an application whose
  // AHV number an admin typed) may carry it although no field of this form does
  const keys = ssnFieldKeys(fields).add(SSN_FIELD_KEY);
  return Object.fromEntries(Object.entries(values ?? {}).filter(([key]) => !keys.has(key)));
}

/** What an e-mail or an export shows instead of an AHV answer: «angegeben» or «–», never the number. */
export function ssnPresenceLabel(value: unknown): string {
  if (value === undefined || value === null) return '–';
  if (typeof value === 'string' || typeof value === 'number') return isBlankAhv(value) ? '–' : 'angegeben';
  return 'angegeben';
}
