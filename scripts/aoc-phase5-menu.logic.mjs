/** The AOC submenu is the four hub areas, in hub order (spec 1.101 phase 5). A test pins them to the catalogue. */
export const HUB_ROWS = ['aoc-access', 'aoc-ops', 'aoc-config', 'aoc-data'];

/**
 * Row names the hub absorbed: they leave every `aoc-menu*` doc, and their row docs are archived unless a menu
 * outside `aoc-menu*` still lists them. Task 5 removed all ten from the catalogue (a test pins that), so their live
 * docs have no owner any more.
 */
export const HUB_ABSORBED = [
  'aoc-admin', 'aoc-sessions', 'aoc-email', 'user-all', 'priv-register', 'priv-audit', 'activity-all', 'ticket-all',
  'workflow-all', 'tenant-features',
];

/**
 * Tenants split off the shared `aoc-menu` doc into their own fork with a fixed list. kring-app declares only the
 * `/aoc/ops` and `/aoc/config` hub routes (no `/aoc/access`, no `/aoc/data`), so kring's submenu is those two.
 */
export const FORK_SPLITS = { kring: ['aoc-ops', 'aoc-config'] };
export const SHARED_PARENT_ID = 'aoc-menu';
const PARENT_NAME = 'aoc-menu';

/** Row field values, copied from libs/tenant/util/src/lib/feature-blocks.ts (a test pins the two together). */
export const ROW_SPECS = {
  'aoc-access': { url: '/aoc/access', action: 'navigate', roleNeeded: 'admin', icon: 'shield', label: '@item.aoc-access' },
  'aoc-ops': { url: '/aoc/ops', action: 'navigate', roleNeeded: 'admin', icon: 'history', label: '@item.aoc-ops' },
  'aoc-config': { url: '/aoc/config', action: 'navigate', roleNeeded: 'admin', icon: 'settings', label: '@item.aoc-config' },
  'aoc-data': { url: '/aoc/data', action: 'navigate', roleNeeded: 'admin', icon: 'database', label: '@item.aoc-data' },
};

/**
 * --apply write order. Rows exist before a menu references them; the fork is created before its tenant leaves the
 * shared doc (create-then-detach, as MenuService.fork: a failed detach leaves two docs, never none); absorbed rows
 * are archived last.
 */
export const APPLY_ORDER = ['rows', 'forks', 'detach', 'parents', 'leaving'];

/**
 * Seeding rule (menu skill: release first, seed second). Printed in the usage text and in apply mode; --apply is
 * refused without --released.
 */
export const RELEASE_FIRST =
  'Run --apply only after the app release that ships the hub routes and @item.aoc-access/ops/config labels is live on every app — otherwise admins lose their AOC navigation.';
export const USAGE = `Usage: node scripts/aoc-phase5-menu.mjs [--dry-run | --apply --released]\n${RELEASE_FIRST}`;

/** CLI args → { apply } or { error }. --apply needs --released (the caller confirms the release is live). */
export function parseArgs(args) {
  const known = ['--apply', '--dry-run', '--released'];
  if (args.some((a) => !known.includes(a))) return { error: USAGE };
  const apply = args.includes('--apply');
  if (apply && args.includes('--dry-run')) return { error: USAGE };
  if (apply && !args.includes('--released')) return { error: `--apply needs --released.\n${USAGE}` };
  return { apply };
}

const arr = (v) => (Array.isArray(v) ? v : []);
const only = (doc, tenant) => arr(doc.tenants).length === 1 && arr(doc.tenants)[0] === tenant;
const sameList = (a, b) => a.length === b.length && a.every((n, i) => n === b[i]);

/** The create() doc for a row: same field template as phases 2–4. */
function rowDoc(name, s, tenants) {
  return {
    name, url: s.url, action: s.action, roleNeeded: s.roleNeeded, icon: s.icon, label: s.label,
    tenants, menuItems: [], data: [], description: '', tags: '', isArchived: false,
    index: `n:${name} a:${s.action} k:${name}`,
  };
}

/**
 * An AOC submenu doc becomes its hub rows followed by the names it lists that are neither absorbed nor hub rows, in
 * their old order. The hub rows are HUB_ROWS, or the FORK_SPLITS list for a doc of exactly one split tenant (its own
 * extra rows are kept as well, never overwritten).
 * Archived docs are reported and left alone.
 */
export function planAocParent(doc) {
  const before = arr(doc.menuItems);
  if (doc.isArchived === true) return { id: doc.id, action: 'warn', menuItems: before, reason: 'archived; left alone' };
  const split = arr(doc.tenants).length === 1 ? FORK_SPLITS[arr(doc.tenants)[0]] : undefined;
  const head = split ?? HUB_ROWS;
  const removed = before.filter((n) => HUB_ABSORBED.includes(n));
  const extras = before.filter((n) => !HUB_ABSORBED.includes(n) && !HUB_ROWS.includes(n));
  const menuItems = [...head, ...extras];
  const reason = [
    removed.length ? `remove [${removed.join(', ')}]` : '',
    split ? `${arr(doc.tenants)[0]}-only hub [${head.join(', ')}]` : `hub [${head.join(', ')}]`,
    extras.length ? `keep [${extras.join(', ')}]` : '',
  ].filter(Boolean).join('; ');
  if (sameList(menuItems, before)) return { id: doc.id, action: 'skip', menuItems, reason: 'already migrated' };
  return { id: doc.id, action: 'update', menuItems, reason };
}

/** Docs other than `shared` (forks, incl. planned ones) that cover `tenant`. */
const forksOf = (shared, parentDocs, tenant) =>
  parentDocs.filter((d) => d.id !== shared.id && arr(d.tenants).includes(tenant));

/**
 * The fork for a FORK_SPLITS tenant: create `<name>_<tenant>` (fork-on-edit shape, as MenuService.fork: a copy of
 * the shared doc with `tenants: [tenant]` and `forkedFrom`) / skip when it exists / warn on every state it cannot
 * reason about.
 */
export function planFork(shared, parentDocs, tenant) {
  const id = `${PARENT_NAME}_${tenant}`;
  const forks = forksOf(shared, parentDocs, tenant);
  if (forks.length > 1) return { id, action: 'warn', reason: `${forks.length} forks cover ${tenant} (${forks.map((d) => d.id).join(', ')}); not guessing` };
  if (forks.length === 1) {
    const [f] = forks;
    if (f.isArchived === true) return { id: f.id, action: 'warn', reason: `fork ${f.id} is archived; not revived` };
    if (!only(f, tenant)) return { id: f.id, action: 'warn', reason: `fork ${f.id} has tenants [${arr(f.tenants).join(', ')}], not exactly [${tenant}]; decide by hand` };
    return { id: f.id, action: 'skip', reason: 'fork exists' };
  }
  if (shared.isArchived === true) return { id, action: 'warn', reason: `shared ${shared.id} is archived; no fork made` };
  if (!arr(shared.tenants).includes(tenant)) return { id, action: 'warn', reason: `no ${PARENT_NAME} doc covers ${tenant}; nothing to split` };
  if (only(shared, tenant)) return { id, action: 'warn', reason: `shared ${shared.id} is ${tenant}-only; detaching would orphan it, decide by hand` };
  const fields = Object.fromEntries(Object.entries(shared).filter(([k]) => !['id', 'menuItems', 'tenants', 'forkedFrom', 'index'].includes(k)));
  const doc = {
    ...fields, isArchived: false, tenants: [tenant], menuItems: [...FORK_SPLITS[tenant]], forkedFrom: shared.id,
    index: `n:${PARENT_NAME} a:${shared.action} k:${id}`,
  };
  return { id, action: 'create', doc, reason: `fork for [${tenant}]: [${doc.menuItems.join(', ')}]` };
}

/** Remove `tenant` from the shared doc's tenants — only once exactly one live `[tenant]`-only fork exists (or is planned). */
export function planDetach(shared, parentDocs, tenant) {
  if (!arr(shared.tenants).includes(tenant)) return { id: shared.id, action: 'skip', reason: `${tenant} already detached` };
  const forks = forksOf(shared, parentDocs, tenant).filter((d) => d.isArchived !== true && only(d, tenant));
  if (forks.length !== 1) {
    return { id: shared.id, action: 'warn', reason: `no ${PARENT_NAME}_${tenant} fork (found ${forks.length}); ${tenant} kept on ${shared.id}` };
  }
  const tenants = arr(shared.tenants).filter((t) => t !== tenant);
  if (!tenants.length) return { id: shared.id, action: 'warn', reason: `${shared.id} would have no tenants; not detached` };
  return { id: shared.id, action: 'detach', tenants, reason: `remove ${tenant} from tenants → [${tenants.join(', ')}]` };
}

/** Union (sorted) of the tenants of every non-archived (post-plan) parent doc whose menuItems list `name`. */
export function collectRowTenants(parentDocs, name) {
  const set = new Set();
  for (const d of parentDocs) {
    if (d.isArchived === true || !arr(d.menuItems).includes(name)) continue;
    arr(d.tenants).forEach((t) => set.add(t));
  }
  return [...set].sort();
}

/**
 * `existing` = every doc with this row name. Create (id = name) / extend tenants / skip / warn on duplicates, forks,
 * archived docs and a label that differs from the catalogue (reported, never overwritten). Tenants only ever grow.
 */
export function planRow(existing, name, tenants) {
  const want = [...new Set(tenants)].sort();
  const s = ROW_SPECS[name];
  if (existing.length > 1) {
    return { id: name, action: 'warn', reason: `${existing.length} docs named ${name} (${existing.map((d) => d.id).join(', ')}); not guessing, skipped` };
  }
  if (existing.length === 0) {
    return { id: name, action: 'create', tenants: want, doc: rowDoc(name, s, want), reason: `create for [${want.join(', ')}]` };
  }
  const [doc] = existing;
  const have = arr(doc.tenants);
  const missing = want.filter((t) => !have.includes(t));
  if (doc.isArchived === true) {
    return { id: doc.id, action: 'warn', reason: `only doc is archived (${doc.id}); not extended, tenants [${want.join(', ')}] cannot see ${name}` };
  }
  if (doc.id !== name) {
    return { id: doc.id, action: 'warn', reason: `only doc is a fork (${doc.id}); left alone, tenants [${missing.join(', ')}] stay uncovered` };
  }
  if (doc.label !== s.label) {
    return { id: doc.id, action: 'warn', reason: `label ${doc.label} is not the catalogue's ${s.label}; decide by hand (tenants not extended)` };
  }
  return missing.length === 0
    ? { id: doc.id, action: 'skip', reason: 'row exists for all tenants' }
    : { id: doc.id, action: 'extend', tenants: [...have, ...missing].sort(), reason: `add tenants [${missing.join(', ')}]` };
}

/** An absorbed row doc: archive unless already archived or a menu doc outside `aoc-menu*` still lists it. */
export function planLeavingRow(doc, otherReferrers) {
  if (doc.isArchived === true) return { id: doc.id, action: 'skip', reason: 'already archived' };
  if (otherReferrers.length) {
    return { id: doc.id, action: 'warn', reason: `${doc.name} still listed by [${otherReferrers.map((d) => d.id).join(', ')}]; not archived` };
  }
  return { id: doc.id, action: 'archive', reason: `${doc.name} absorbed by the AOC hub` };
}

/**
 * Apply-time gate for a parent update: a doc whose detach was planned but not written (its in-transaction re-plan
 * declined) keeps its old list too, so a tenant that should have left it never sees the new hub rows there.
 * `writtenDetachIds` = ids whose detach was written in this run.
 */
export function gateParentOnDetach(plan, detachPlans, writtenDetachIds) {
  const pending = detachPlans.filter((d) => d.id === plan.id && d.action === 'detach' && !writtenDetachIds.has(d.id));
  if (plan.action !== 'update' || !pending.length) return plan;
  return { ...plan, action: 'warn', reason: `detach of [${pending.map((d) => d.tenant).join(', ')}] not written; parent not updated` };
}
