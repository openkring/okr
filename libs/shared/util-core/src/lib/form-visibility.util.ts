import type { Field, FieldCondition, VisibilityRule } from '@okr/shared-models';
import { isBlankAhv, isSsnField } from './ahv.util';
import { getAge } from './date.util';

/**
 * Form visibility evaluator (1.125) — one pure implementation shared by the form renderer,
 * the builder preview, the response summary and the `submitForm` Cloud Function.
 *
 * Pure and deterministic: no Angular, no clock (the caller passes `today`), no I/O. It never
 * throws on legacy or garbage input — anything it cannot interpret simply does not match.
 *
 * Rules (spec §5):
 *  - A condition may only reference a field with a LOWER `order`.
 *  - A hidden controller's value counts as empty ("hidden propagates").
 *  - A divider's rule governs the divider and every field up to the next divider
 *    (effective visibility = block rule AND own rule).
 *  - A dangling condition (unknown field, equal/higher order, display-only controller)
 *    counts as TRUE — showing too much is recoverable, hiding a required field is not.
 */

const DISPLAY_TYPES: ReadonlySet<string> = new Set(['label', 'paragraph', 'divider']);
const STORE_DATE = /^\d{8}$/;

type Cmp = 'lt' | 'lte' | 'gt' | 'gte';

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === '' || value === false || (Array.isArray(value) && value.length === 0);
}

/** Finite number from a number or a non-blank numeric string; NaN for everything else. */
function toFinite(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

function compare(op: Cmp, a: number | string, b: number | string): boolean {
  switch (op) {
    case 'lt': return a < b;
    case 'lte': return a <= b;
    case 'gt': return a > b;
    case 'gte': return a >= b;
  }
}

/** lt/lte/gt/gte on numbers, or on StoreDates (compared as strings) when the controller is a date. */
function compareValues(op: Cmp, controllerType: string, actual: unknown, expected: unknown): boolean {
  if (controllerType === 'date') {
    if (typeof actual !== 'string' || !STORE_DATE.test(actual)) return false;
    const exp = typeof expected === 'number' ? String(expected) : expected;
    if (typeof exp !== 'string' || !STORE_DATE.test(exp)) return false;
    return compare(op, actual, exp);
  }
  const a = toFinite(actual);
  const e = toFinite(expected);
  if (Number.isNaN(a) || Number.isNaN(e)) return false;
  return compare(op, a, e);
}

function betweenValues(controllerType: string, actual: unknown, range: unknown): boolean {
  if (!Array.isArray(range) || range.length !== 2) return false;
  return compareValues('gte', controllerType, actual, range[0]) && compareValues('lte', controllerType, actual, range[1]);
}

function valuesEqual(controllerType: string, actual: unknown, expected: unknown): boolean {
  if (controllerType === 'number' || controllerType === 'rating') {
    const a = toFinite(actual);
    const e = toFinite(expected);
    return !Number.isNaN(a) && !Number.isNaN(e) && a === e;
  }
  if (Array.isArray(actual)) return false;
  if (typeof expected === 'object' && expected !== null) return false;
  return String(actual) === String(expected);
}

function valueList(expected: unknown): string[] {
  if (Array.isArray(expected)) return expected.map((x) => String(x));
  if (expected === undefined || expected === null) return [];
  return [String(expected)];
}

function isIn(actual: unknown, expected: unknown): boolean {
  const list = valueList(expected);
  if (Array.isArray(actual)) return actual.some((a) => list.includes(String(a)));
  return list.includes(String(actual));
}

/** Checkbox-with-options: the answer holds every listed value. */
function containsAll(actual: unknown, expected: unknown): boolean {
  if (!Array.isArray(actual)) return false;
  const wanted = valueList(expected);
  if (wanted.length === 0) return false;
  const have = actual.map((a) => String(a));
  return wanted.every((w) => have.includes(w));
}

function checkAge(op: 'ageGte' | 'ageLt', actual: unknown, expected: unknown, today: string): boolean {
  if (typeof actual !== 'string') return false;
  const refYear = Number(String(today).slice(0, 4));
  const threshold = toFinite(expected);
  if (!Number.isInteger(refYear) || refYear <= 0 || Number.isNaN(threshold)) return false;
  const age = getAge(actual, false, refYear);
  if (age === -1) return false; // empty / invalid date: every age comparison is false
  return op === 'ageGte' ? age >= threshold : age < threshold;
}

/** The type the operators compare by: an implicit controller behaves like the field type of its `valueType`. */
function controllerKind(controller: Field): string {
  if (controller.type !== 'implicit') return controller.type;
  return controller.valueType === 'boolean' ? 'checkbox' : controller.valueType === 'number' ? 'number' : 'text';
}

function evaluateFor(
  cond: FieldCondition,
  ownerOrder: number,
  fields: Field[],
  values: Record<string, unknown>,
  visible: Set<string>,
  today: string,
): boolean {
  if (typeof cond !== 'object' || cond === null) return true; // garbage entry: dangling
  const controller = fields.find((x) => x.id === cond.fieldId);
  if (controller === undefined || DISPLAY_TYPES.has(controller.type) || !(controller.order < ownerOrder)) return true;

  // Hidden propagates: a controller that is not visible reads as empty.
  const actual = visible.has(controller.id) ? values?.[controller.key] : undefined;
  const type = controllerKind(controller);
  // An AHV field that holds only the mask scaffolding ('756.') holds no number: it reads as empty.
  const empty = isEmptyValue(actual) || (isSsnField(controller) && typeof actual === 'string' && isBlankAhv(actual));

  switch (cond.op) {
    case 'isEmpty': return empty;
    case 'isFilled': return !empty;
    case 'isChecked': return actual === true;
    case 'isNotChecked': return actual !== true;
    case 'equals': return !empty && valuesEqual(type, actual, cond.value);
    case 'notEquals': return empty || !valuesEqual(type, actual, cond.value);
    case 'in': return !empty && isIn(actual, cond.value);
    case 'notIn': return empty || !isIn(actual, cond.value);
    case 'contains': return !empty && containsAll(actual, cond.value);
    case 'notContains': return empty || !containsAll(actual, cond.value);
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': return !empty && compareValues(cond.op, type, actual, cond.value);
    case 'between': return !empty && betweenValues(type, actual, cond.value);
    case 'ageGte':
    case 'ageLt': return !empty && checkAge(cond.op, actual, cond.value, today);
    default: return false; // unknown operator never matches
  }
}

/**
 * Does one condition hold? `values` is keyed by field `key` (not `id`); `visible` is the set of
 * field ids already shown — a controller outside it reads as empty. A dangling condition
 * (unknown field, display-only controller) is true. The earlier-only (`order`) check needs the
 * owning field and is applied by `getVisibleFieldIds`.
 */
export function evaluateCondition(
  cond: FieldCondition,
  fields: Field[],
  values: Record<string, unknown>,
  visible: Set<string>,
  today: string,
): boolean {
  return evaluateFor(cond, Number.POSITIVE_INFINITY, fields, values, visible, today);
}

function evaluateRule(
  rule: VisibilityRule | undefined | null,
  ownerOrder: number,
  fields: Field[],
  values: Record<string, unknown>,
  visible: Set<string>,
  today: string,
): boolean {
  if (typeof rule !== 'object' || rule === null || !Array.isArray(rule.conditions) || rule.conditions.length === 0) return true;
  const hold = (c: FieldCondition) => evaluateFor(c, ownerOrder, fields, values, visible, today);
  return rule.match === 'any' ? rule.conditions.some(hold) : rule.conditions.every(hold);
}

/**
 * Does a whole rule hold (all/any over its conditions)? Used by derived values (spec §6), whose
 * conditions may reference ANY input field — the earlier-only `order` check is not applied.
 * A missing or empty rule holds (same as for visibility).
 */
export function evaluateVisibilityRule(
  rule: VisibilityRule | undefined | null,
  fields: Field[],
  values: Record<string, unknown>,
  visible: Set<string>,
  today: string,
): boolean {
  return evaluateRule(rule, Number.POSITIVE_INFINITY, fields, values ?? {}, visible, today);
}

/**
 * The ids of the fields that are shown for the given answers. Walks the fields by `order`;
 * hidden fields are absent from the result (and so are not required, validated or stored).
 */
export function getVisibleFieldIds(fields: Field[], values: Record<string, unknown>, today: string): Set<string> {
  const sorted = [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const visible = new Set<string>();
  let blockVisible = true;

  for (const field of sorted) {
    const own = evaluateRule(field.visibleIf, field.order, sorted, values ?? {}, visible, today);
    if (field.type === 'divider') {
      // A divider's rule is the block rule: it governs the divider and everything up to the next divider.
      blockVisible = own;
      if (own) visible.add(field.id);
    } else if (blockVisible && own) {
      visible.add(field.id);
    }
  }
  return visible;
}
