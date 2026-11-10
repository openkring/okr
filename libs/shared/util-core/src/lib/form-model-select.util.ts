import { MODEL_SELECT_KEY_SUFFIX } from '@okr/shared-models';
import type { Field, ModelSelectField, ModelSelectFieldType } from '@okr/shared-models';
import { FORM_OTHER_TEXT_MAX } from './form-values.util';

/**
 * Person / org / resource pickers of a form, and the page's fixed answers (`FormSectionConfig.fixedValues`).
 *
 * Pure: no Angular, no Firestore. Shared by `getFormDefinition` / `submitForm` (authoritative) and the app
 * renderers, so the list a filler sees and the list the server checks against are filtered the same way.
 */

/** One entry of a picker's list: the record's okey and the name the filler sees and the answer stores. */
export interface ModelSelectChoice {
  key: string;
  name: string;
}

/** The collection each picker reads. */
export const MODEL_SELECT_COLLECTIONS: Record<ModelSelectFieldType, string> = {
  person: 'persons',
  org: 'orgs',
  resource: 'resources',
};

const MODEL_SELECT_TYPES: readonly string[] = ['person', 'org', 'resource'];

/** True for a person/org/resource picker (also tolerates untyped JSON). */
export function isModelSelect(field: { type?: unknown } | undefined | null): field is ModelSelectField {
  return typeof field?.type === 'string' && MODEL_SELECT_TYPES.includes(field.type);
}

/** The key that holds the okey of the picked record: `<key>Key`. */
export function modelSelectKeyOf(field: { key: string }): string {
  return field.key + MODEL_SELECT_KEY_SUFFIX;
}

/** The name a record shows in a picker: «Vorname Nachname» for a person, `name` for an org or a resource. */
export function modelChoiceName(type: ModelSelectFieldType, data: Record<string, unknown>): string {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  if (type === 'person') return [text(data['firstName']), text(data['lastName'])].filter(Boolean).join(' ');
  return text(data['name']);
}

/**
 * The list of one picker: the records of `tenantId` that are not archived, of the field's `filter` type when it
 * has one, with a name — sorted by name (German collation), each okey once. `docs` carry their id as `okey`.
 */
export function projectModelChoices(
  field: Pick<ModelSelectField, 'type' | 'filter'>,
  docs: Record<string, unknown>[],
  tenantId: string,
): ModelSelectChoice[] {
  const filter = typeof field.filter === 'string' ? field.filter.trim() : '';
  const seen = new Set<string>();
  const choices: ModelSelectChoice[] = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    const key = doc?.['okey'];
    if (typeof key !== 'string' || key === '' || seen.has(key)) continue;
    if (doc['isArchived'] === true) continue;
    const tenants = doc['tenants'];
    if (!Array.isArray(tenants) || !tenants.includes(tenantId)) continue;
    if (filter !== '' && doc['type'] !== filter) continue;
    const name = modelChoiceName(field.type, doc);
    if (name === '') continue;
    seen.add(key);
    choices.push({ key, name });
  }
  return choices.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/** The choices whose name contains `query` (case- and accent-insensitive), at most `limit`; none for a blank query. */
export function matchModelChoices(choices: readonly ModelSelectChoice[], query: string, limit = 8): ModelSelectChoice[] {
  const q = fold(query);
  if (q === '') return [];
  return choices.filter((c) => fold(c.name).includes(q)).slice(0, limit);
}

/** The one choice whose name is exactly `name` (ignoring case, accents and outer spaces); undefined when none or several. */
export function choiceByName(choices: readonly ModelSelectChoice[], name: unknown): ModelSelectChoice | undefined {
  if (typeof name !== 'string') return undefined;
  const n = fold(name);
  if (n === '') return undefined;
  const hits = choices.filter((c) => fold(c.name) === n);
  return hits.length === 1 ? hits[0] : undefined;
}

function fold(text: string): string {
  return (typeof text === 'string' ? text : '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// ──────────────────────────────────────────
// Answers of a picker (server)
// ──────────────────────────────────────────

/** What `sanitizeModelSelectAnswers` makes of the client's answers. */
export interface ModelSelectSanitized {
  /** the answers with every `<key>Key` checked: kept only for a listed record, the name then that record's */
  values: Record<string, unknown>;
  /** keys of pickers without free text whose name is not a listed record */
  refused: string[];
}

/**
 * Checks the pickers' answers against their lists (`choices`, by field key — for a person only the records a
 * signed-in filler may see; an anonymous filler gets none). A `<key>Key` of a listed record stays and the answer
 * becomes that record's name; any other `<key>Key` is dropped. A name typed exactly like one listed record takes
 * its key. A name that is no listed record is kept when the field allows free text — always for a person without
 * a list (an anonymous filler types the name) — and refused otherwise. A `<key>Key` that is a real field's key
 * is that field's own answer and is left alone. Too long a name is left to the length check of the field.
 */
export function sanitizeModelSelectAnswers(
  fields: Field[] | undefined,
  raw: Record<string, unknown>,
  choices: Record<string, ModelSelectChoice[]>,
): ModelSelectSanitized {
  const all = Array.isArray(fields) ? fields : [];
  const values: Record<string, unknown> = { ...(raw ?? {}) };
  const refused: string[] = [];
  const realKeys = new Set(all.map((f) => f?.key));
  for (const field of all) {
    if (!isModelSelect(field) || typeof field.key !== 'string') continue;
    const keyKey = modelSelectKeyOf(field);
    const owned = realKeys.has(keyKey);
    const list = choices?.[field.key] ?? [];
    const name = values[field.key];
    const sentKey = owned ? undefined : values[keyKey];
    if (!owned) delete values[keyKey];
    if (typeof name !== 'string' || name.trim() === '') continue;

    const picked = typeof sentKey === 'string' ? list.find((c) => c.key === sentKey) : undefined;
    const match = picked ?? choiceByName(list, name);
    if (match) {
      values[field.key] = match.name;
      if (!owned) values[keyKey] = match.key;
      continue;
    }
    const freeText = field.allowCustom === true || (field.type === 'person' && list.length === 0);
    if (!freeText) refused.push(field.key);
  }
  return { values, refused };
}

// ──────────────────────────────────────────
// Fixed answers of a page (`FormSectionConfig.fixedValues`)
// ──────────────────────────────────────────

/** The field types a page may fix: the closed choices. */
export const FIXABLE_FIELD_TYPES: readonly string[] = ['category', 'dropdown', 'radio'];

/** True for a field a page may fix (`FIXABLE_FIELD_TYPES`). */
export function isFixableField(field: { type?: unknown } | undefined | null): boolean {
  return typeof field?.type === 'string' && FIXABLE_FIELD_TYPES.includes(field.type);
}

/**
 * The page's fixed answers that apply to `fields`: only for a fixable field of the form, only a non-blank text no
 * longer than an «Andere» text, and for a dropdown or radio only one of its option values. Everything else is
 * dropped — a section saved before the form changed fixes nothing it no longer fits.
 */
export function resolveFixedValues(
  fields: Field[] | undefined,
  fixedValues: Record<string, unknown> | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fixedValues || typeof fixedValues !== 'object') return result;
  for (const field of Array.isArray(fields) ? fields : []) {
    if (!isFixableField(field) || typeof field.key !== 'string') continue;
    if (!Object.prototype.hasOwnProperty.call(fixedValues, field.key)) continue;
    const value = fixedValues[field.key];
    if (typeof value !== 'string' || value.trim() === '' || value.length > FORM_OTHER_TEXT_MAX) continue;
    if ((field.type === 'dropdown' || field.type === 'radio') && !(field.options ?? []).some((o) => o?.value === value)) continue;
    result[field.key] = value;
  }
  return result;
}
