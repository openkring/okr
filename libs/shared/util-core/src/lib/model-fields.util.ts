export interface ModelFieldSpec { field: string; defaultVisible: boolean; }

/** modelKey → field → visible. Only entries that differ from the catalogue default are stored. */
export type ModelFieldMap = Record<string, Record<string, boolean>>;

const on = (...fields: string[]): ModelFieldSpec[] => fields.map((field) => ({ field, defaultVisible: true }));

const RESOURCE_COMMON = on('load', 'currentValue', 'color', 'data', 'tags', 'description');

/** The fields a tenant may hide, per model key. Anything not listed here is always shown. */
export const MODEL_FIELDS: Record<string, readonly ModelFieldSpec[]> = {
  person: [
    { field: 'title', defaultVisible: false },
    ...on('nickname', 'maidenName', 'dateOfBirth', 'dateOfDeath', 'ssnId', 'bexioId', 'externalIds', 'tags', 'notes'),
  ],
  org: on('dateOfFoundation', 'dateOfLiquidation', 'taxId', 'bexioId', 'tags', 'notes'),
  'resource.rboat': on('load', 'currentValue', 'color', 'tripAlert', 'data', 'tags', 'description'),
  'resource.boat': RESOURCE_COMMON,
  'resource.car': RESOURCE_COMMON,
  'resource.other': RESOURCE_COMMON,
  'resource.pet': on('color', 'data', 'tags', 'description'),
  'resource.realestate': on('currentValue', 'data', 'tags', 'description'),
  'resource.locker': on('data', 'tags', 'description'),
  'resource.key': on('data', 'tags', 'description'),
};

function storedFor(stored: ModelFieldMap | null | undefined, modelKey: string): Record<string, unknown> {
  const entry: unknown = stored?.[modelKey];
  return entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
}

/** The fields of a model that are currently hidden; stored values that are not booleans count as the default. */
export function hiddenFieldsOf(modelKey: string, stored: ModelFieldMap | null | undefined): ReadonlySet<string> {
  const entry = storedFor(stored, modelKey);
  const hidden = new Set<string>();
  for (const spec of MODEL_FIELDS[modelKey] ?? []) {
    const value = entry[spec.field];
    const visible = typeof value === 'boolean' ? value : spec.defaultVisible;
    if (!visible) hidden.add(spec.field);
  }
  return hidden;
}

/** Returns a new map with one field set; a value equal to the catalogue default is not stored. */
export function withFieldVisibility(stored: ModelFieldMap | null | undefined, modelKey: string, field: string, visible: boolean): ModelFieldMap {
  const next: ModelFieldMap = {};
  for (const [key, value] of Object.entries(stored ?? {})) {
    if (value !== null && typeof value === 'object') next[key] = { ...value };
  }
  const entry = { ...(next[modelKey] ?? {}) };
  const spec = MODEL_FIELDS[modelKey]?.find((s) => s.field === field);
  if (spec && spec.defaultVisible === visible) delete entry[field];
  else entry[field] = visible;
  if (Object.keys(entry).length === 0) delete next[modelKey];
  else next[modelKey] = entry;
  return next;
}

/** `resource.<type>` for a resource type that has its own field list, otherwise `resource.other`. */
export function resourceFieldKey(type: string | undefined): string {
  const key = `resource.${type ?? ''}`;
  return type && Object.prototype.hasOwnProperty.call(MODEL_FIELDS, key) ? key : 'resource.other';
}

/** A hidden field is still shown while it has validation errors, so the user can fix it. */
export function isFieldShown(field: string, hidden: ReadonlySet<string>, errors: readonly unknown[]): boolean {
  return !hidden.has(field) || errors.length > 0;
}
