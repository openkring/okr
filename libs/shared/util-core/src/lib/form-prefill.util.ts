import type { BaseType, Field, PropertyType } from '@okr/shared-models';
import { OTHER_OPTION_VALUE } from '@okr/shared-models';
import { isSsnField } from './ahv.util';
import { classifyStoreDate, convertDateFormatToString, DateFormat, isValidPartialStoreDate } from './date.util';
import { coerceToPropertyType } from './form-values.util';

/**
 * Pre-fill from a form link and implicit values (1.125 phase B, spec §8 and §8.1).
 *
 * Pure and deterministic: no Angular, no clock, no I/O. Shared by the public form (client) and
 * `submitForm` (server). Pre-fill is convenience, not trust — the server validates the result like
 * any other answer. Nothing here throws: a value that does not fit its field is ignored.
 */

/** Field types a link may never fill (secrets, vault data, uploads, display-only elements). */
export const PREFILL_EXCLUDED_TYPES: readonly string[] = [
  'password', 'iban', 'file', 'images', 'signature', 'avatar', 'ssn', 'label', 'paragraph', 'divider',
];

/** Excluded by type, or an AHV field by `isSsnField` (also a legacy `text` field keyed `ssnId`). */
function isPrefillExcluded(field: Field): boolean {
  return PREFILL_EXCLUDED_TYPES.includes(field.type) || isSsnField(field);
}

/** Own-property test (the lib target predates `Object.hasOwn`); keeps `constructor` & co. out. */
function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const STORE_DATE = /^\d{8}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `true`/`1` and `false`/`0` (case-insensitive); anything else is `undefined`. */
function parseBool(raw: string): boolean | undefined {
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1') return true;
  if (v === 'false' || v === '0') return false;
  return undefined;
}

/** A complete, real calendar date as `yyyymmdd` from `yyyy-mm-dd` or `yyyymmdd`; `undefined` otherwise. */
function parseDateValue(raw: string): string | undefined {
  const v = raw.trim();
  let store: string;
  if (ISO_DATE.test(v)) store = convertDateFormatToString(v, DateFormat.IsoDate, DateFormat.StoreDate, false);
  else if (STORE_DATE.test(v)) store = v;
  else return undefined;
  if (store === '' || classifyStoreDate(store) !== 'full' || !isValidPartialStoreDate(store)) return undefined;
  return store;
}

/** A client value for an implicit field: the booleans of a link (`1`/`0`) too, otherwise the plain coercion. */
function coerceClient(value: unknown, type: PropertyType): BaseType | undefined {
  return type === 'boolean' && typeof value === 'string' ? parseBool(value) : coerceToPropertyType(value, type);
}

function parseNumberValue(raw: string, min?: number, max?: number, integer?: boolean): number | undefined {
  const n = coerceToPropertyType(raw, 'number');
  if (typeof n !== 'number') return undefined;
  if (typeof min === 'number' && n < min) return undefined;
  if (typeof max === 'number' && n > max) return undefined;
  if (integer === true && !Number.isInteger(n)) return undefined;
  return n;
}

/**
 * Parses one raw query-parameter value for a field: the typed answer, or `undefined` when the
 * value is invalid for the field (an unknown option, a malformed date, a number outside min/max,
 * …) or the field is never pre-fillable. A link never selects «Andere».
 */
export function parsePrefillValue(field: Field, raw: string): unknown | undefined {
  if (typeof raw !== 'string' || raw === '' || isPrefillExcluded(field)) return undefined;

  switch (field.type) {
    case 'implicit': {
      if (field.fromLink !== true) return undefined;
      return coerceClient(raw, field.valueType);
    }
    case 'dropdown':
    case 'radio': {
      if (raw === OTHER_OPTION_VALUE) return undefined;
      return (field.options ?? []).some((o) => o.value === raw) ? raw : undefined;
    }
    case 'checkbox': {
      const options = field.options ?? [];
      if (options.length === 0) return parseBool(raw);
      const parts = raw.split(',').map((p) => p.trim()).filter((p) => p !== '');
      if (parts.length === 0) return undefined;
      const known = new Set(options.map((o) => o.value));
      if (parts.some((p) => p === OTHER_OPTION_VALUE || !known.has(p))) return undefined;
      return [...new Set(parts)];
    }
    case 'date':
      return parseDateValue(raw);
    case 'number':
      return parseNumberValue(raw, field.min, field.max, field.integer);
    case 'rating': {
      // stars start at 1 (0.5 with half stars) and run up to `scale` (default 5)
      const max = typeof field.scale === 'number' && field.scale > 0 ? field.scale : 5;
      const n = parseNumberValue(raw, field.allowHalf === true ? 0.5 : 1, max);
      if (n === undefined) return undefined;
      return Number.isInteger(n) || (field.allowHalf === true && Number.isInteger(n * 2)) ? n : undefined;
    }
    case 'time': {
      const t = raw.trim();
      if (!TIME.test(t)) return undefined;
      if (typeof field.min === 'string' && TIME.test(field.min) && t < field.min) return undefined;
      if (typeof field.max === 'string' && TIME.test(field.max) && t > field.max) return undefined;
      return t;
    }
    case 'text':
      return typeof field.maxLength === 'number' && raw.length > field.maxLength ? undefined : raw;
    case 'email':
    case 'phone':
    case 'category':
      return raw;
    default:
      return undefined;
  }
}

/** The first value of a query parameter that may be repeated. */
function firstValue(param: string | string[] | undefined): string | undefined {
  const v = Array.isArray(param) ? param[0] : param;
  return typeof v === 'string' ? v : undefined;
}

/**
 * Pre-fill values for a form from its link's query parameters (named after field `key`). Unknown
 * keys, invalid values and excluded fields are ignored silently; a repeated parameter uses its
 * first value. `keys` lists only the accepted keys (what `lockWhenPrefilled` applies to).
 */
export function parsePrefillParams(
  fields: Field[],
  params: Record<string, string | string[]>,
): { values: Record<string, unknown>; keys: string[] } {
  const values: Record<string, unknown> = {};
  const keys: string[] = [];
  if (!Array.isArray(fields) || typeof params !== 'object' || params === null) return { values, keys };

  for (const field of fields) {
    const key = field?.key;
    if (typeof key !== 'string' || key === '' || keys.includes(key) || !hasOwn(params, key)) continue;
    const raw = firstValue(params[key]);
    if (raw === undefined) continue;
    const parsed = parsePrefillValue(field, raw);
    if (parsed === undefined) continue;
    values[key] = parsed;
    keys.push(key);
  }
  return { values, keys };
}

/**
 * The values of a form's implicit fields (§8.1). Per field the first source that yields a value of
 * the field's `valueType` wins: the section's `implicitValues`, then the client value (only when
 * `fromLink`; a raw string or an already parsed value), then `defaultValue`. No source → the key
 * is absent. A value of the wrong type falls through to the next source.
 */
export function resolveImplicitValues(
  fields: Field[],
  sectionValues: Record<string, BaseType> | undefined,
  clientValues: Record<string, unknown>,
): Record<string, BaseType> {
  const result: Record<string, BaseType> = {};
  for (const field of Array.isArray(fields) ? fields : []) {
    if (field?.type !== 'implicit' || typeof field.key !== 'string') continue;
    const type = field.valueType;

    const sectionRaw = sectionValues && hasOwn(sectionValues, field.key) ? sectionValues[field.key] : undefined;
    const fromSection = sectionRaw === '' ? undefined : coerceToPropertyType(sectionRaw, type);
    // never from the client for an AHV field (R1), even with fromLink
    const clientRaw = field.fromLink === true && !isSsnField(field) && clientValues && hasOwn(clientValues, field.key) ? clientValues[field.key] : undefined;
    const fromClient = clientRaw === '' ? undefined : coerceClient(clientRaw, type);
    const fromDefault = coerceToPropertyType(field.defaultValue, type);

    const value = fromSection ?? fromClient ?? fromDefault;
    if (value !== undefined) result[field.key] = value;
  }
  return result;
}
