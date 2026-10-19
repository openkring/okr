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

/**
 * Operator-only rows (spec 1.101 §6). NOT catalogue rows: operator tools live outside the catalogue (a test
 * pins that feature-blocks.ts does not declare them). bka does not enable the `chat` block, so the catalogue's
 * `chat-maintenance` row and its `/chat/maintenance` route are gated away there; the operator reaches
 * Chat-Wartung through bka-app's `/operator/chat` and this bka-only row in bka's AOC submenu. Plain label
 * (no `@`): resolveMenuLabelKey passes it through, like `tenant-features`.
 */
export const OPERATOR_TENANT = 'bka';
export const OPERATOR_ROW_SPECS = {
  'operator-chat': { action: 'navigate', url: '/operator/chat', roleNeeded: 'admin', icon: 'chatbubbles', label: 'Chat-Wartung (Betreiber)' },
};
/** Operator rows go after this name in bka's AOC submenu when it is there (operator tools side by side), else at the end. */
export const OPERATOR_ANCHOR = 'aoc-allocation';

/** --apply write order. Rows exist before a menu references them; leaving rows are archived last. */
export const APPLY_ORDER = ['rows', 'contexts', 'parents', 'leaving'];

const arr = (v) => (Array.isArray(v) ? v : []);

/** The create() doc for a row: one field template for catalogue and operator rows. */
function rowDoc(name, s, tenants) {
  return {
    name, url: s.url, action: s.action, roleNeeded: s.roleNeeded, icon: s.icon, label: s.label,
    tenants, menuItems: [], data: [], description: '', tags: '', isArchived: false,
    index: `n:${name} a:${s.action} k:${name}`,
  };
}

const isOperatorOnly = (doc) => arr(doc.tenants).length === 1 && arr(doc.tenants)[0] === OPERATOR_TENANT;

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

/**
 * An AOC submenu doc: drop the leaving names, keep the order. bka's own submenu (tenants exactly ['bka'])
 * also gains the operator rows it lacks, right after OPERATOR_ANCHOR (or at the end). A submenu shared by
 * bka and other tenants never gets them: the row would show up there too (only a dangling-ref warning, but
 * not ours to decide) — it is reported instead.
 */
export function planAocParent(doc) {
  const before = arr(doc.menuItems);
  const removed = before.filter((n) => LEAVING.includes(n));
  let menuItems = before.filter((n) => !LEAVING.includes(n));
  const reasons = removed.length ? [`remove [${removed.join(', ')}]`] : [];
  const operatorNames = Object.keys(OPERATOR_ROW_SPECS).filter((n) => !menuItems.includes(n));
  if (operatorNames.length && isOperatorOnly(doc)) {
    const at = menuItems.indexOf(OPERATOR_ANCHOR);
    menuItems = at < 0 ? [...menuItems, ...operatorNames] : [...menuItems.slice(0, at + 1), ...operatorNames, ...menuItems.slice(at + 1)];
    reasons.push(`add operator [${operatorNames.join(', ')}]`);
  } else if (operatorNames.length && arr(doc.tenants).includes(OPERATOR_TENANT)) {
    reasons.push(`shared with [${arr(doc.tenants).filter((t) => t !== OPERATOR_TENANT).join(', ')}], operator rows not added — fork it first`);
  }
  const changed = menuItems.length !== before.length || menuItems.some((n, i) => n !== before[i]);
  return {
    id: doc.id,
    action: changed ? 'update' : 'skip',
    menuItems,
    reason: reasons.length ? reasons.join('; ') : 'already migrated',
  };
}

/** `existing` = every doc with this operator row name. Create bka-only (id = name) / skip when bka-only / warn otherwise. */
export function planOperatorRow(existing, name) {
  if (existing.length > 1) {
    return { id: name, action: 'warn', reason: `${existing.length} docs named ${name} (${existing.map((d) => d.id).join(', ')}); not guessing, skipped` };
  }
  const s = OPERATOR_ROW_SPECS[name];
  if (existing.length === 0) {
    return { id: name, action: 'create', tenants: [OPERATOR_TENANT], doc: rowDoc(name, s, [OPERATOR_TENANT]), reason: `create for [${OPERATOR_TENANT}]` };
  }
  const [doc] = existing;
  if (doc.isArchived === true) return { id: doc.id, action: 'warn', reason: `only doc is archived (${doc.id}); not revived` };
  if (!isOperatorOnly(doc)) return { id: doc.id, action: 'warn', reason: `tenants [${arr(doc.tenants).join(', ')}] are not exactly [${OPERATOR_TENANT}]; decide by hand` };
  if (doc.url !== s.url) return { id: doc.id, action: 'warn', reason: `url ${doc.url} is not ${s.url}; decide by hand` };
  return { id: doc.id, action: 'skip', reason: 'operator row exists' };
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
      doc: rowDoc(name, s, want),
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
