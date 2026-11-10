import { OTHER_OPTION_VALUE } from '@okr/shared-models';
import type { BaseType, DerivedValue, Field } from '@okr/shared-models';
import {
  buildTypedProperties,
  coerceToPropertyType,
  computeDerivedValues,
  FORM_OTHER_TEXT_MAX,
  formatAnswer,
  getVisibleFieldIds,
  isSsnField,
  normalizeAhv,
  omitSsnValues,
  propertyTypeOf,
} from '@okr/shared-util-core';

/**
 * The server side of a form submission (1.125, spec §7.2): the definition decides what is
 * stored, never the client. Pure — no Firestore, no logger; `submitForm` does the throwing.
 *
 * Hidden means absent: a hidden field is not required, not validated and not stored. Keys that
 * are not an input field of the definition (honeypot, `_jsToken`, `personKey`, `reviewer`, …)
 * are dropped. Derived values overwrite whatever the client sent for the same key.
 *
 * Implicit values (spec §8.1) come from `submitForm` (section config, then an allowed link value, then the
 * field default): every client value for an implicit field is dropped first, the `implicit` argument is merged
 * over the rest, and an implicit field is never required. An «Andere» text (`<key>Other`, spec §9) is kept only
 * for a visible `allowOther` field whose answer picks «Andere», only when no real field owns that key, and is
 * required then; one over `FORM_OTHER_TEXT_MAX` is reported in `invalidProperties`.
 *
 * AHV numbers (`ssn` fields, and any field keyed `ssnId`) are vault data (privacy 1.19): checked here (EAN-13), stored in the
 * electronic 13-digit format in the target record, and never copied anywhere else — the e-mail
 * rows show «angegeben», the task note and every other side effect get `omitSsnValues`.
 */

export interface PreparedSubmission {
  values: Record<string, unknown>;
  /** Keys of visible required fields that are empty. */
  missingRequired: string[];
  /** Keys of visible `asProperty` fields whose answer does not coerce to the property type. */
  invalidProperties: string[];
  /** Keys of visible AHV (`ssn`) fields whose answer is not a valid AHV number. */
  invalidSsn: string[];
  /** Keys of derived `asProperty` values that do not coerce to their type (admin-authored: logged, not rejected). */
  droppedDerivedProperties: string[];
  /** Ids of the fields visible for the merged input (client values plus the implicit ones). */
  visible: Set<string>;
  /** Visible input answers by key — implicit values and valid «Andere» texts included, before `asProperty` fields move into `properties`. */
  answers: Record<string, unknown>;
  /** What the notification e-mail shows: visible answers in field order, then derived values. */
  rows: SubmissionRow[];
  /** Every derived value computed on the server, `asProperty` ones included (1.152: the applicant type of a course choice). */
  derivedValues: Record<string, string>;
}

export interface SubmissionRow { label: string; value: string; }

const DISPLAY_TYPES: ReadonlySet<string> = new Set(['label', 'paragraph', 'divider']);

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function isSingleCheckbox(field: Field): boolean {
  return field.type === 'checkbox' && !(Array.isArray(field.options) && field.options.length > 0);
}

/** Display names for raw answers, by field key then raw value — e.g. `{ courseId: { <okey>: <course name> } }`. */
export type ValueNames = Record<string, Record<string, string>>;

/** One row value: a known display name, else «Andere: <text>» for the «Andere» choice, else `formatAnswer`. */
function rowValue(field: Field, answers: Record<string, unknown>, names: ValueNames): string {
  const answer = answers[field.key];
  if (isSsnField(field)) return formatAnswer(field, answer);
  const named = names[field.key];
  if (named !== undefined && typeof answer === 'string' && Object.prototype.hasOwnProperty.call(named, answer)) {
    return named[answer];
  }
  if (picksOther(field, answer)) {
    const text = answers[otherTextKey(field)];
    const other = typeof text === 'string' && text.trim() !== '' ? `Andere: ${text}` : 'Andere';
    if (!Array.isArray(answer)) return other;
    return answer.map((v) => (v === OTHER_OPTION_VALUE ? other : String(v))).join(', ');
  }
  return formatAnswer(field, answer);
}

/**
 * The rows of the notification e-mail (pure): visible input fields in field order with their
 * answer (booleans as ja/nein, «Andere» with its text, a raw value with a known display name — the
 * course — as that name), then every derived value labelled by its key. Hidden and display
 * fields are not shown. An AHV (`ssn`) answer shows as «angegeben» / «–», never as the number.
 */
export function buildSubmissionRows(
  sortedVisibleInputs: Field[],
  answers: Record<string, unknown>,
  derivedValues: Record<string, string>,
  names: ValueNames = {},
): SubmissionRow[] {
  const rows: SubmissionRow[] = sortedVisibleInputs.map((f) => ({
    label: f.label,
    value: rowValue(f, answers, names ?? {}),
  }));
  for (const [key, value] of Object.entries(derivedValues)) rows.push({ label: key, value: formatAnswer(undefined, value) });
  return rows;
}

function otherTextKey(field: Field): string {
  return `${field.key}Other`;
}

/** The answer picks «Andere»: the reserved value, or a list holding it (checkbox group). */
function picksOther(field: Field, value: unknown): boolean {
  if (!('allowOther' in field) || field.allowOther !== true) return false;
  return Array.isArray(value) ? value.includes(OTHER_OPTION_VALUE) : value === OTHER_OPTION_VALUE;
}

/**
 * The «Andere» text of one visible field (spec §9): required when «Andere» is picked, kept in `answers` under
 * `<key>Other` when valid. Skipped when a real field of the form owns that key (its value is that field's own
 * answer); too long -> `invalidProperties`. Anything else stays out of `answers`, i.e. is stripped.
 */
function collectOtherText(
  field: Field,
  value: unknown,
  input: Record<string, unknown>,
  defs: Field[],
  answers: Record<string, unknown>,
  missingRequired: string[],
  invalidProperties: string[],
): void {
  const otherKey = otherTextKey(field);
  if (!picksOther(field, value) || defs.some((x) => x.key === otherKey)) return;
  const text = input[otherKey];
  if (typeof text !== 'string' || text.trim() === '') {
    missingRequired.push(otherKey);
  } else if (text.length > FORM_OTHER_TEXT_MAX) {
    invalidProperties.push(otherKey);
  } else {
    answers[otherKey] = text;
  }
}

export function prepareSubmission(
  fields: Field[],
  derived: DerivedValue[] | undefined,
  propertiesField: string | undefined,
  raw: Record<string, unknown>,
  today: string,
  implicit: Record<string, BaseType> = {},
  /** display names for the e-mail rows only (the course name for `courseId`); never stored */
  names: ValueNames = {},
): PreparedSubmission {
  const defs = (Array.isArray(fields) ? fields : []).filter((f) => !DISPLAY_TYPES.has(f.type));
  const all = Array.isArray(fields) ? fields : [];
  const implicitKeys = new Set(defs.filter((f) => f.type === 'implicit').map((f) => f.key));
  const input: Record<string, unknown> = {};
  // the client never sets an implicit value; the server's resolution (only implicit keys) is merged over the rest
  for (const [key, value] of Object.entries(raw ?? {})) if (!implicitKeys.has(key)) input[key] = value;
  for (const [key, value] of Object.entries(implicit ?? {})) if (implicitKeys.has(key)) input[key] = value;
  const visible = getVisibleFieldIds(all, input, today);
  const sorted = [...defs].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const missingRequired: string[] = [];
  const invalidProperties: string[] = [];
  const invalidSsn: string[] = [];
  const droppedDerivedProperties: string[] = [];
  const answers: Record<string, unknown> = {};

  for (const field of sorted) {
    if (!visible.has(field.id)) continue;
    let value = input[field.key];
    // also a legacy `text` field keyed ssnId: the same number, checked and stored the same way
    if (isSsnField(field) && value !== undefined) {
      // '' for no number (also the bare mask '756.'), the 13 digits for a valid one
      const ssn = normalizeAhv(value);
      if (ssn === undefined) {
        invalidSsn.push(field.key);
        continue;
      }
      value = ssn;
    }
    if (field.required && field.type !== 'implicit' && isEmpty(value)) missingRequired.push(field.key);
    if (value !== undefined) {
      answers[field.key] = value;
    } else if (isSingleCheckbox(field)) {
      // An unticked single checkbox may arrive as nothing at all: store the «nein», not a gap.
      answers[field.key] = false;
    }
    collectOtherText(field, value, input, defs, answers, missingRequired, invalidProperties);
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
    const otherKey = otherTextKey(field);
    if (otherKey in answers) values[otherKey] = answers[otherKey];
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

  const rows = buildSubmissionRows(sorted.filter((f) => visible.has(f.id)), answers, derivedValues, names);
  return { values, missingRequired, invalidProperties, invalidSsn, droppedDerivedProperties, visible, answers, rows, derivedValues };
}

/**
 * The note of the approval task a submission opens (pure). The answers go in WITHOUT the AHV
 * numbers: `tasks` is read by the assignee and outlives the application, and the subject-data
 * map finds a task by its author/assignee only — an AHV number copied there would survive the
 * applicant's erasure.
 */
export function buildSubmissionTaskNotes(
  fields: Field[] | undefined,
  submissionId: string,
  formKey: string,
  values: Record<string, unknown>,
): string {
  return JSON.stringify({ submissionId, formKey, values: omitSsnValues(fields, values) });
}
