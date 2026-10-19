export const LEAVING = ['aoc-chat', 'aoc-account', 'aoc-auth'];

/**
 * Names appended to each context menu, copied from the tail of libs/tenant/util/src/lib/feature-blocks.ts (a test pins
 * the two together). `contextMenuChat` is declared twice in the catalogue (chat block + subject co-declaration),
 * field-identically. Live there can be forks too: the script appends to every non-archived doc named `contextMenuChat`.
 * `maint-divider` already exists live as a shared doc (phase 2); planRow extends its tenants, it never recreates it.
 */
export const MAINT = {
  contextMenuChat: ['maint-divider', 'chat-maintenance'],
};

/** Row field values, copied from feature-blocks.ts (a test pins the two together). */
export const ROW_SPECS = {
  'maint-divider': { action: 'divider', url: '', roleNeeded: 'admin', icon: 'help-circle', label: '@item.maint-divider' },
  'chat-maintenance': { action: 'navigate', url: '/chat/maintenance', roleNeeded: 'admin', icon: 'settings', label: '@item.chat-maintenance' },
};

/** --apply write order. Rows exist before a menu references them; leaving rows are archived last. */
export const APPLY_ORDER = ['rows', 'contexts', 'parents', 'leaving'];

const arr = (v) => (Array.isArray(v) ? v : []);

/** A context menu doc: append the names it lacks at the end, in the given order. Idempotent; touches nothing else. */
export function planContextMenu(doc, names) {
  const before = arr(doc.menuItems);
  const missing = names.filter((n) => !before.includes(n));
  return {
    id: doc.id,
    action: missing.length ? 'append' : 'skip',
    menuItems: [...before, ...missing],
    reason: missing.length ? `append [${missing.join(', ')}]` : 'already migrated',
  };
}

/** An AOC submenu doc: drop the leaving names, keep the order. */
export function planAocParent(doc) {
  const before = arr(doc.menuItems);
  const removed = before.filter((n) => LEAVING.includes(n));
  return {
    id: doc.id,
    action: removed.length ? 'update' : 'skip',
    menuItems: before.filter((n) => !LEAVING.includes(n)),
    reason: removed.length ? `remove [${removed.join(', ')}]` : 'already migrated',
  };
}

/** Union (sorted) of the tenants of every non-archived context-menu doc whose (post-plan) menuItems list `name`. */
export function collectRowTenants(contextDocs, name) {
  const set = new Set();
  for (const d of contextDocs) {
    if (d.isArchived === true || !arr(d.menuItems).includes(name)) continue;
    arr(d.tenants).forEach((t) => set.add(t));
  }
  return [...set].sort();
}

/** `existing` = every doc with this row name. Create (id = name) / extend tenants / skip / warn on duplicates. */
export function planRow(existing, name, tenants) {
  const want = [...new Set(tenants)].sort();
  if (existing.length > 1) {
    return { id: name, action: 'warn', reason: `${existing.length} docs named ${name} (${existing.map((d) => d.id).join(', ')}); not guessing, skipped` };
  }
  if (existing.length === 0) {
    const s = ROW_SPECS[name];
    return {
      id: name,
      action: 'create',
      tenants: want,
      doc: {
        name, url: s.url, action: s.action, roleNeeded: s.roleNeeded, icon: s.icon, label: s.label,
        tenants: want, menuItems: [], data: [], description: '', tags: '', isArchived: false,
        index: `n:${name} a:${s.action} k:${name}`,
      },
      reason: `create for [${want.join(', ')}]`,
    };
  }
  const [doc] = existing;
  const uncovered = want.filter((t) => !arr(doc.tenants).includes(t));
  if (doc.isArchived === true) {
    return { id: doc.id, action: 'warn', reason: `only doc is archived (${doc.id}); not extended, tenants [${want.join(', ')}] cannot see ${name}` };
  }
  if (doc.id !== name) {
    return { id: doc.id, action: 'warn', reason: `only doc is a fork (${doc.id}); left alone, tenants [${uncovered.join(', ')}] stay uncovered` };
  }
  const have = arr(doc.tenants);
  const missing = want.filter((t) => !have.includes(t));
  return missing.length === 0
    ? { id: doc.id, action: 'skip', reason: 'row exists for all tenants' }
    : { id: doc.id, action: 'extend', tenants: [...have, ...missing].sort(), reason: `add tenants [${missing.join(', ')}]` };
}

/** A leaving row doc: archive unless already archived or another (non-aoc-parent) menu doc still lists it. */
export function planLeavingRow(doc, otherReferrers) {
  if (doc.isArchived === true) return { id: doc.id, action: 'skip', reason: 'already archived' };
  if (otherReferrers.length) {
    return { id: doc.id, action: 'warn', reason: `${doc.name} still listed by [${otherReferrers.map((d) => d.id).join(', ')}]; not archived` };
  }
  return { id: doc.id, action: 'archive', reason: `${doc.name} left the AOC` };
}
