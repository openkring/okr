/**
 * Pure helpers for scripts/fix-models.mjs (spec 1.101 phase 1) — ported 1:1 from the former
 * AocDataStore (fixUndefinedFields / fixTypes). Field specs: `s:string n:number b:boolean m:map a:array`,
 * optionally `=default` for fixUndefinedFields (e.g. `n:priority=1`).
 */

/** Sets missing (undefined/null) fields to their default. Mutates and returns doc. */
export function fixUndefinedFields(doc, fieldsToCheck) {
  for (const field of fieldsToCheck) {
    const colonIdx = field.indexOf(':');
    if (colonIdx === -1) continue;
    const type = field.substring(0, colonIdx);
    const rest = field.substring(colonIdx + 1);
    const eqIdx = rest.indexOf('=');
    let attr = rest;
    let defaultValue;
    if (eqIdx !== -1) {
      attr = rest.substring(0, eqIdx);
      defaultValue = rest.substring(eqIdx + 1);
    }
    if (!attr) continue;
    const value = doc[attr];
    if (value === undefined || value === null) {
      switch (type) {
        case 's':
          doc[attr] = defaultValue !== undefined ? String(defaultValue) : '';
          break;
        case 'n':
          doc[attr] = defaultValue !== undefined ? Number(defaultValue) : 0;
          break;
        case 'b':
          doc[attr] = defaultValue !== undefined ? defaultValue === 'true' || defaultValue === true : false;
          break;
        case 'm':
          doc[attr] = {};
          break;
        case 'a':
          doc[attr] = [];
          break;
      }
    }
  }
  return doc;
}

/** Converts each listed field to the given type. Mutates and returns doc. */
export function fixTypes(doc, fieldsToFix) {
  for (const field of fieldsToFix) {
    const [type, attr] = field.split(':');
    if (!attr) continue;
    const value = doc[attr];
    switch (type) {
      case 's':
        doc[attr] = value !== undefined && value !== null ? String(value) : '';
        break;
      case 'n':
        doc[attr] = value !== undefined && value !== null && value !== '' ? Number(value) : 0;
        break;
      case 'b':
        doc[attr] = value === 'true' || value === true;
        break;
      case 'm':
        if (typeof value === 'string') {
          doc[attr] = [value]; // sic: ported 1:1 — a string in a map field becomes a one-element array
        } else if (typeof value !== 'object' || value === null) {
          doc[attr] = {};
        }
        break;
      case 'a':
        if (typeof value === 'string') {
          doc[attr] = [value];
        } else if (!Array.isArray(value)) {
          doc[attr] = [];
        }
        break;
    }
  }
  return doc;
}

/**
 * Plans the fix of one document without mutating it. Returns the top-level fields that differ
 * (compared by JSON) — exactly what update() should write. `custom(doc)` is an optional hook that
 * returns an extra patch (applied last). `okey` is never part of the patch.
 */
export function planFix(doc, { defaults = [], typeSpec = [], custom } = {}) {
  const work = structuredClone(doc);
  if (defaults.length > 0) fixUndefinedFields(work, defaults);
  if (typeSpec.length > 0) fixTypes(work, typeSpec);
  if (custom) Object.assign(work, custom(structuredClone(work)) ?? {});
  const patch = {};
  for (const key of Object.keys(work)) {
    if (key === 'okey') continue;
    if (JSON.stringify(work[key]) !== JSON.stringify(doc[key])) patch[key] = work[key];
  }
  return { changed: Object.keys(patch).length > 0, patch };
}
