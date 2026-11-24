/** The catalogue row of the app settings (spec 1.174 §9.2). A test pins it to libs/tenant/util/src/lib/feature-blocks.ts. */
export const ROW_NAME = 'tenant-settings';
export const ROW_SPEC = { url: '/tenant/settings', action: 'navigate', roleNeeded: 'admin', icon: 'settings', label: '@item.tenant-settings' };
/** Forks keep the name of the shared doc, so every AOC submenu is found by it. */
export const PARENT_NAME = 'aoc-menu';
/** The catalogue closes the submenu with this row. */
export const CLOSING_DIVIDER = 'divider_empty';

export const USAGE = 'Usage: node scripts/seed-tenant-settings-menu.mjs [--dry-run | --apply [--allow-unreleased-labels]]';

/** CLI args → { apply } or { error }. Dry run is the default. */
export function parseArgs(args) {
  const known = ['--apply', '--dry-run', '--allow-unreleased-labels'];
  if (args.some((a) => !known.includes(a))) return { error: USAGE };
  const apply = args.includes('--apply');
  if (apply && args.includes('--dry-run')) return { error: USAGE };
  return { apply };
}

const arr = (v) => (Array.isArray(v) ? v : []);

/** Union (sorted) of the tenants of every live AOC submenu, forks included. */
export function collectTenants(parentDocs) {
  return [...new Set(parentDocs.filter((d) => d.isArchived !== true).flatMap((d) => arr(d.tenants)))].sort();
}

/** The create() doc of the row: the field template of the AOC phase scripts. */
function rowDoc(tenants) {
  const s = ROW_SPEC;
  return {
    name: ROW_NAME, url: s.url, action: s.action, roleNeeded: s.roleNeeded, icon: s.icon, label: s.label,
    tenants, menuItems: [], data: [], description: '', tags: '', isArchived: false,
    index: `n:${ROW_NAME} a:${s.action} k:${ROW_NAME}`,
  };
}

/**
 * `existing` = every doc with the row's name. Create (id = name) / extend tenants / skip. Tenants only ever grow and no
 * other field is touched. An archived doc, a fork and a duplicate need a decision by hand: warn, and write nothing.
 */
export function planRow(existing, tenants) {
  const want = [...new Set(tenants)].sort();
  if (want.length === 0) return { id: ROW_NAME, action: 'warn', tenants: [], reason: `no live ${PARENT_NAME} doc; nothing to seed` };
  if (existing.length > 1) {
    return { id: ROW_NAME, action: 'warn', tenants: [], reason: `${existing.length} docs named ${ROW_NAME} (${existing.map((d) => d.id).join(', ')}); not guessing` };
  }
  if (existing.length === 0) return { id: ROW_NAME, action: 'create', tenants: want, doc: rowDoc(want), reason: `create for [${want.join(', ')}]` };
  const [doc] = existing;
  const have = arr(doc.tenants);
  if (doc.isArchived === true) return { id: doc.id, action: 'warn', tenants: [], reason: `archived (${doc.id}); not revived` };
  if (doc.id !== ROW_NAME) return { id: doc.id, action: 'warn', tenants: have, reason: `only doc is a fork (${doc.id}); left alone` };
  const missing = want.filter((t) => !have.includes(t));
  const all = [...have, ...missing].sort();
  return missing.length === 0
    ? { id: doc.id, action: 'skip', tenants: have, reason: 'row exists for all tenants' }
    : { id: doc.id, action: 'extend', tenants: all, missing, reason: `add tenants [${missing.join(', ')}]` };
}

/**
 * An AOC submenu gets the row before its closing divider (the last `divider_empty`), at the end when it has none. Listed
 * already: left as it is, wherever it stands. Every other entry keeps its place. `rowTenants` = the tenants the row has
 * after the plan: a submenu with a tenant outside it is left alone, or that tenant would see «Missing: tenant-settings».
 */
export function planParent(doc, rowTenants) {
  const before = arr(doc.menuItems);
  const base = { id: doc.id, menuItems: before };
  if (doc.isArchived === true) return { ...base, action: 'warn', reason: 'archived; left alone' };
  if (before.includes(ROW_NAME)) return { ...base, action: 'skip', reason: 'lists the row' };
  const uncovered = arr(doc.tenants).filter((t) => !rowTenants.includes(t));
  if (uncovered.length) return { ...base, action: 'warn', reason: `the row does not cover [${uncovered.join(', ')}]; not linked` };
  const at = before.lastIndexOf(CLOSING_DIVIDER);
  const pos = at < 0 ? before.length : at;
  const menuItems = [...before.slice(0, pos), ROW_NAME, ...before.slice(pos)];
  return { id: doc.id, action: 'update', menuItems, reason: `insert ${at < 0 ? 'at the end' : `before ${CLOSING_DIVIDER}`} → [${menuItems.join(', ')}]` };
}
