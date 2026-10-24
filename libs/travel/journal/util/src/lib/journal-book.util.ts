/**
 * Deep copy of a Firestore write payload without `undefined` values (Firestore rejects them). Plain objects and
 * arrays are recursed into; anything else (strings, numbers, FieldValue sentinels such as deleteField() or
 * arrayUnion(), which are class instances) is passed through untouched.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.filter((v) => v !== undefined).map((v) => stripUndefined(v)) as T;
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = stripUndefined(v);
    return out as T;
  }
  return value;
}
