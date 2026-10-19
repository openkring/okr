export const LEAVING = ['aoc-content', 'aoc-doc', 'aoc-diary', 'aoc-kiosk'];

/** Tail of each context menu, copied from libs/tenant/util/src/lib/feature-blocks.ts (a test pins the two together). */
export const MAINT = {
  'c-calevents': ['maint-divider', 'calevent-check-duplicates'],
  'c-groups': ['maint-divider', 'group-check-hygiene', 'group-chat-members', 'group-chat-postpolicy', 'group-chat-guests'],
  'c-persons': ['maint-divider', 'person-check-favaddress'],
  'c-pages': ['maint-divider-content', 'page-integrity'],
  'c-documents': ['maint-divider', 'document-orphans'],
  'c-trips': ['maint-divider-trip', 'trip-maintenance', 'maint-divider', 'trip-kiosk'],
  'c-diary': ['maint-divider', 'diary-import'],
};

/** Row field values, copied from feature-blocks.ts (a test pins the two together). */
export const ROW_SPECS = {
  'maint-divider': { action: 'divider', url: '', roleNeeded: 'admin', icon: 'help-circle', label: '@item.maint-divider' },
  'calevent-check-duplicates': { action: 'call', url: 'checkDuplicates', roleNeeded: 'admin', icon: 'copy', label: '@item.calevent-check-duplicates' },
  'group-check-hygiene': { action: 'call', url: 'checkHygiene', roleNeeded: 'admin', icon: 'checkbox-circle-double', label: '@item.group-check-hygiene' },
  'group-chat-members': { action: 'call', url: 'chatMembers', roleNeeded: 'admin', icon: 'checkbox-circle-double', label: '@item.group-chat-members' },
  'group-chat-postpolicy': { action: 'call', url: 'chatPostPolicy', roleNeeded: 'admin', icon: 'checkbox-circle-double', label: '@item.group-chat-postpolicy' },
  'group-chat-guests': { action: 'call', url: 'chatGuests', roleNeeded: 'admin', icon: 'checkbox-circle-double', label: '@item.group-chat-guests' },
  'person-check-favaddress': { action: 'call', url: 'checkFavAddresses', roleNeeded: 'admin', icon: 'location', label: '@item.person-check-favaddress' },
  'maint-divider-content': { action: 'divider', url: '', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '@item.maint-divider-content' },
  'page-integrity': { action: 'navigate', url: '/page/integrity', roleNeeded: 'contentAdmin', icon: 'checkbox-circle-double', label: '@item.page-integrity' },
  'document-orphans': { action: 'navigate', url: '/document/orphans', roleNeeded: 'admin', icon: 'document', label: '@item.document-orphans' },
  'maint-divider-trip': { action: 'divider', url: '', roleNeeded: 'tripAdmin', icon: 'help-circle', label: '@item.maint-divider-trip' },
  'trip-maintenance': { action: 'navigate', url: '/trips/maintenance', roleNeeded: 'tripAdmin', icon: 'hammer', label: '@item.trip-maintenance' },
  'trip-kiosk': { action: 'navigate', url: '/trips/kiosk', roleNeeded: 'admin', icon: 'settings', label: '@item.trip-kiosk' },
  'diary-import': { action: 'navigate', url: '/diary/import', roleNeeded: 'admin', icon: 'download', label: '@item.diary-import' },
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
    return { id: name, action: 'warn', reason: `WARN ${existing.length} docs named ${name} (${existing.map((d) => d.id).join(', ')}); not guessing, skipped` };
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
  if (doc.id !== name) return { id: doc.id, action: 'skip', reason: `fork row doc (${doc.id}); left alone` };
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
    return { id: doc.id, action: 'warn', reason: `WARN ${doc.name} still listed by [${otherReferrers.map((d) => d.id).join(', ')}]; not archived` };
  }
  return { id: doc.id, action: 'archive', reason: `${doc.name} left the AOC` };
}
