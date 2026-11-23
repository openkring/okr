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

const has = (obj: object, key: string): boolean => Object.prototype.hasOwnProperty.call(obj, key);

/** Own-property lookup only: 'constructor', '__proto__' and 'toString' are not model keys. */
function specsFor(modelKey: string): readonly ModelFieldSpec[] {
  return has(MODEL_FIELDS, modelKey) ? MODEL_FIELDS[modelKey] : [];
}

/** Defines an own data property, so a '__proto__' key never reaches the prototype. */
function setOwn<T>(target: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function storedFor(stored: ModelFieldMap | null | undefined, modelKey: string): Record<string, unknown> {
  if (!isObject(stored) || !has(stored, modelKey)) return {};
  const entry: unknown = stored[modelKey];
  return isObject(entry) ? entry : {};
}

/** The fields of a model that are currently hidden; stored values that are not booleans count as the default. */
export function hiddenFieldsOf(modelKey: string, stored: ModelFieldMap | null | undefined): ReadonlySet<string> {
  const entry = storedFor(stored, modelKey);
  const hidden = new Set<string>();
  for (const spec of specsFor(modelKey)) {
    const value = has(entry, spec.field) ? entry[spec.field] : undefined;
    const visible = typeof value === 'boolean' ? value : spec.defaultVisible;
    if (!visible) hidden.add(spec.field);
  }
  return hidden;
}

/** Returns a new map with one field set; a value equal to the catalogue default is not stored. */
export function withFieldVisibility(stored: ModelFieldMap | null | undefined, modelKey: string, field: string, visible: boolean): ModelFieldMap {
  const next: ModelFieldMap = {};
  if (isObject(stored)) {
    for (const key of Object.keys(stored)) {
      const value: unknown = stored[key];
      if (isObject(value)) {
        const copy: Record<string, boolean> = {};
        for (const f of Object.keys(value)) setOwn(copy, f, (value as Record<string, boolean>)[f]);
        setOwn(next, key, copy);
      }
    }
  }
  const entry: Record<string, boolean> = {};
  const current = has(next, modelKey) ? next[modelKey] : {};
  for (const f of Object.keys(current)) setOwn(entry, f, current[f]);
  const spec = specsFor(modelKey).find((s) => s.field === field);
  if (spec && spec.defaultVisible === visible) delete entry[field];
  else setOwn(entry, field, visible);
  if (Object.keys(entry).length === 0) delete next[modelKey];
  else setOwn(next, modelKey, entry);
  return next;
}

/** Returns a new map without the entry of one model, i.e. that model back at its catalogue defaults. */
export function withoutModel(stored: ModelFieldMap | null | undefined, modelKey: string): ModelFieldMap {
  const next: ModelFieldMap = {};
  if (!isObject(stored)) return next;
  for (const key of Object.keys(stored)) {
    const value: unknown = stored[key];
    if (key === modelKey || !isObject(value)) continue;
    const copy: Record<string, boolean> = {};
    for (const f of Object.keys(value)) setOwn(copy, f, (value as Record<string, boolean>)[f]);
    setOwn(next, key, copy);
  }
  return next;
}

/** `resource.<type>` for a resource type that has its own field list, otherwise `resource.other`. */
export function resourceFieldKey(type: string | undefined): string {
  const key = `resource.${type ?? ''}`;
  return type && has(MODEL_FIELDS, key) ? key : 'resource.other';
}

/** A hidden field is still shown while it has validation errors, so the user can fix it. */
export function isFieldShown(field: string, hidden: ReadonlySet<string>, errors: readonly unknown[]): boolean {
  return !hidden.has(field) || errors.length > 0;
}
