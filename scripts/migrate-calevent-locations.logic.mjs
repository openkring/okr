/**
 * Pure planning helpers for migrate-calevent-locations.mjs. No Firebase here, so the plan is
 * unit-tested in migrate-calevent-locations.test.mjs.
 */

/** A Firestore autoid, to recognise the key of a location that no longer exists. */
const LOOKS_LIKE_ID = /^(?=.*\d)[A-Za-z0-9_-]{15,}$/;

const keyedAvatar = (okey, location, name) => ({
  key: okey, name1: name, name2: '', label: name, modelType: 'location', type: location.type ?? '', subType: '',
});

const textAvatar = (text) => ({ key: '', name1: text, name2: '', label: text, modelType: 'location', type: '', subType: '' });

/**
 * Turns a stored `locationKey` into `locations`. Three shapes are in the data: `name@okey` (the
 * form), `okey@name` (quick entry until 2026-11) and free text, which may contain an '@' of its
 * own. So the `locations` collection decides which part is the key, not the position.
 * The event's own text wins over the location's current name: nobody should see a label change
 * because of this migration.
 *
 * @param {string} raw the stored locationKey
 * @param {Map<string, {name?: string, type?: string}>} knownLocations every location, by okey
 * @returns {{ kind: string, locations: object[] }}
 */
export function parseLocationKey(raw, knownLocations) {
  const value = (raw ?? '').trim();
  if (value === '') return { kind: 'empty', locations: [] };

  const at = value.lastIndexOf('@');
  if (at < 0) {
    const known = knownLocations.get(value);
    return known
      ? { kind: 'okey', locations: [keyedAvatar(value, known, known.name ?? value)] }
      : { kind: 'text', locations: [textAvatar(value)] };
  }

  const left = value.slice(0, at).trim();
  const right = value.slice(at + 1).trim();
  const knownRight = knownLocations.get(right);
  if (knownRight) return { kind: 'name@okey', locations: [keyedAvatar(right, knownRight, left || (knownRight.name ?? right))] };
  const knownLeft = knownLocations.get(left);
  if (knownLeft) return { kind: 'okey@name', locations: [keyedAvatar(left, knownLeft, right || (knownLeft.name ?? left))] };

  if (right === '') return { kind: 'text', locations: [textAvatar(left)] };
  if (left === '') return { kind: 'text', locations: [textAvatar(right)] };
  if (LOOKS_LIKE_ID.test(right)) return { kind: 'name@deleted', locations: [textAvatar(left)] };
  if (LOOKS_LIKE_ID.test(left)) return { kind: 'deleted@name', locations: [textAvatar(right)] };
  return { kind: 'text', locations: [textAvatar(value)] };
}

/** The stored search index holds the raw locationKey between ` l:` and ` c:`; the new one holds the name. */
export function migrateIndex(index, locationKey, name) {
  if (typeof index !== 'string') return undefined;
  const from = ` l:${locationKey} c:`;
  return index.includes(from) ? index.replace(from, ` l:${name} c:`) : undefined;
}

/**
 * What to do with one calevent; undefined = nothing.
 * A document that already has `locations` keeps them: they were written by a current client, so a
 * `locationKey` beside them comes from an old client and is reported, not converted.
 *
 * @param {{locationKey?: unknown, locations?: unknown, index?: unknown}} doc
 * @param {Map<string, object>} knownLocations
 * @param {boolean} dropField true: delete the emptied `locationKey` field
 * @returns {{ kind: string, locations?: object[], index?: string, clearField: 'blank'|'delete' } | undefined}
 */
export function planEvent(doc, knownLocations, dropField) {
  const hasField = typeof doc.locationKey === 'string';
  const raw = hasField ? doc.locationKey : '';
  const clearField = dropField ? 'delete' : 'blank';
  const needsClearing = raw !== '' || (dropField && hasField);

  if (Array.isArray(doc.locations) && doc.locations.length > 0) {
    if (!needsClearing) return undefined;
    return { kind: raw === '' ? 'clear' : 'conflict', clearField };
  }
  if (raw.trim() === '') return needsClearing ? { kind: 'clear', clearField } : undefined;

  const { kind, locations } = parseLocationKey(raw, knownLocations);
  const index = migrateIndex(doc.index, raw, locations[0].label);
  return { kind, locations, clearField, ...(index === undefined ? {} : { index }) };
}
