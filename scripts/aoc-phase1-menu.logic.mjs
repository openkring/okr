export const STORAGE = 'aoc-storage';
export const FLIGHT = 'flighttracker';
export const EMAIL = 'aoc-email';
export const EMAIL_ANCHORS = ['aoc-doc', 'aoc-account', 'aoc-sessions'];

/** --apply write order. Roots precede parents: flightTenants is derived from the parents, so an interrupted run must not lose it. */
export const APPLY_ORDER = ['email', 'roots', 'parents', 'storage'];

const arr = (v) => (Array.isArray(v) ? v : []);

/** Insert `item` after the first anchor present, else before 'divider_empty', else at the end. Idempotent. */
export function insertAfter(list, item, anchors) {
  const items = arr(list);
  if (items.includes(item)) return items;
  const anchor = anchors.find((a) => items.includes(a));
  const at = anchor !== undefined ? items.indexOf(anchor) + 1
    : items.includes('divider_empty') ? items.indexOf('divider_empty') : items.length;
  return [...items.slice(0, at), item, ...items.slice(at)];
}

/** An AOC submenu doc: drop storage + flight tracker, add the e-mail row. Keeps every other entry and its order. */
export function planAocParent(doc) {
  const before = arr(doc.menuItems);
  const removed = before.filter((n) => n === STORAGE || n === FLIGHT);
  const next = insertAfter(before.filter((n) => n !== STORAGE && n !== FLIGHT), EMAIL, EMAIL_ANCHORS);
  const changed = next.length !== before.length || next.some((n, i) => n !== before[i]);
  return {
    id: doc.id,
    action: changed ? 'update' : 'skip',
    menuItems: next,
    flightTenants: before.includes(FLIGHT) ? arr(doc.tenants) : [],
    reason: changed ? `remove [${removed.join(', ')}], ensure ${EMAIL}` : 'already migrated',
  };
}

/** A root menu main_<tid>: append the flight tracker for tenants that had it under AOC. */
export function planRootDoc(doc, flightTenants) {
  const tenants = arr(doc.tenants);
  const items = arr(doc.menuItems);
  if (!tenants.some((t) => flightTenants.includes(t))) return { id: doc.id, action: 'skip', reason: 'tenant had no flight tracker' };
  if (items.includes(FLIGHT)) return { id: doc.id, action: 'skip', reason: 'already in the main menu' };
  return { id: doc.id, action: 'append', menuItems: [...items, FLIGHT], reason: `append ${FLIGHT}` };
}

/** The storage row doc(s): archive (no tenant keeps the page). */
export function planStorageRow(doc) {
  return doc.isArchived === true
    ? { id: doc.id, action: 'skip', reason: 'already archived' }
    : { id: doc.id, action: 'archive', reason: 'page removed in phase 1' };
}

/** The e-mail row: create once with the union of the AOC parents' tenants; extend tenants if it exists. */
export function planEmailRow(existing, parentTenants) {
  const want = [...new Set(parentTenants)].sort();
  if (!existing) return { action: 'create', tenants: want, reason: `create ${EMAIL} for [${want.join(', ')}]` };
  const have = arr(existing.tenants);
  const missing = want.filter((t) => !have.includes(t));
  return missing.length === 0
    ? { id: existing.id, action: 'skip', reason: 'row exists for all tenants' }
    : { id: existing.id, action: 'extend', tenants: [...have, ...missing], reason: `add tenants [${missing.join(', ')}]` };
}
