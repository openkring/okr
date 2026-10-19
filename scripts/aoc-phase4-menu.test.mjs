import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  APPLY_ORDER, LEAVING, MAINT, ROW_SPECS, collectRowTenants, planAocParent, planContextMenu, planLeavingRow, planRow,
} from './aoc-phase4-menu.logic.mjs';

const T_CHAT = ['bka', 'p13', 'scs', 'bkg', 'kring', 'elab', 'okr', 'kwa'];
const CHAT_ORIG = ['chat-room-edit', 'chat-room-pin'];
const LIVE = {
  contextMenuChat: { id: 'contextMenuChat', name: 'contextMenuChat', tenants: T_CHAT, menuItems: CHAT_ORIG },
};
const FORK = { id: 'contextMenuChat_scs', name: 'contextMenuChat', tenants: ['scs'], menuItems: ['chat-room-pin'] };
const AOC_BKA = { id: 'aoc-menu_bka', name: 'aoc-menu', tenants: ['bka'], menuItems: ['aoc-data', 'aoc-chat', 'aoc-statistics', 'aoc-account', 'aoc-allocation', 'aoc-auth', 'aoc-srv', 'alias-spaces'] };
const postPlan = (docs = Object.values(LIVE)) => docs.map((d) => ({ ...d, menuItems: planContextMenu(d, MAINT.contextMenuChat).menuItems }));

test('contextMenuChat gains maint-divider and chat-maintenance at the end, existing order kept', () => {
  const p = planContextMenu(LIVE.contextMenuChat, MAINT.contextMenuChat);
  assert.equal(p.action, 'append');
  assert.deepEqual(p.menuItems, ['chat-room-edit', 'chat-room-pin', 'maint-divider', 'chat-maintenance']);
  assert.deepEqual(MAINT, { contextMenuChat: ['maint-divider', 'chat-maintenance'] });
});

test('a fork of contextMenuChat is appended too, and its tenants count for the rows', () => {
  const docs = postPlan([LIVE.contextMenuChat, FORK]);
  assert.deepEqual(docs[1].menuItems, ['chat-room-pin', 'maint-divider', 'chat-maintenance']);
  assert.deepEqual(collectRowTenants(docs, 'chat-maintenance'), [...T_CHAT].sort());
});

test('maint-divider is EXTENDED with the contextMenuChat tenants, never recreated', () => {
  const live = { id: 'maint-divider', name: 'maint-divider', tenants: ['bka', 'scs'] };
  const p = planRow([live], 'maint-divider', collectRowTenants(postPlan(), 'maint-divider'));
  assert.equal(p.action, 'extend');
  assert.equal(p.id, 'maint-divider');
  assert.equal(p.doc, undefined);
  assert.deepEqual(p.tenants, [...T_CHAT].sort());
});

test('chat-maintenance is created with the contextMenuChat tenants and the catalogue fields', () => {
  const p = planRow([], 'chat-maintenance', collectRowTenants(postPlan(), 'chat-maintenance'));
  assert.equal(p.action, 'create');
  assert.deepEqual(p.doc.tenants, [...T_CHAT].sort());
  assert.equal(p.doc.url, '/chat/maintenance');
  assert.equal(p.doc.action, 'navigate');
  assert.equal(p.doc.roleNeeded, 'admin');
  assert.equal(p.doc.icon, 'settings');
  assert.equal(p.doc.label, '@item.chat-maintenance');
  assert.equal(p.doc.index, 'n:chat-maintenance a:navigate k:chat-maintenance');
  assert.equal(p.doc.isArchived, false);
  assert.deepEqual(p.doc.menuItems, []);
});

test('planContextMenu appends only the missing names, in MAINT order', () => {
  const p = planContextMenu({ id: 'contextMenuChat', menuItems: ['chat-room-pin', 'chat-maintenance'] }, MAINT.contextMenuChat);
  assert.deepEqual(p.menuItems, ['chat-room-pin', 'chat-maintenance', 'maint-divider']);
});

test('planContextMenu on its own output is skip', () => {
  for (const [key, names] of Object.entries(MAINT)) {
    const once = planContextMenu(LIVE[key], names);
    assert.equal(once.action, 'append');
    assert.equal(planContextMenu({ ...LIVE[key], menuItems: once.menuItems }, names).action, 'skip');
  }
});

test('planContextMenu tolerates malformed menuItems', () => {
  assert.deepEqual(planContextMenu({ id: 'x' }, ['a', 'b']).menuItems, ['a', 'b']);
});

test('planRow: extend adds missing tenants, skip when complete, never edits other fields', () => {
  const e = planRow([{ id: 'maint-divider', name: 'maint-divider', tenants: ['bka'] }], 'maint-divider', ['scs', 'bka']);
  assert.equal(e.action, 'extend');
  assert.deepEqual(e.tenants, ['bka', 'scs']);
  assert.equal(e.doc, undefined);
  assert.equal(planRow([{ id: 'maint-divider', name: 'maint-divider', tenants: ['bka', 'scs'] }], 'maint-divider', ['scs']).action, 'skip');
});

test('planRow: duplicate name warns and skips', () => {
  const p = planRow([{ id: 'maint-divider', tenants: [] }, { id: 'zzz', tenants: [] }], 'maint-divider', ['bka']);
  assert.equal(p.action, 'warn');
  assert.match(p.reason, /2 docs/);
});

test('planRow: a lone fork row doc warns and names the uncovered tenants', () => {
  const p = planRow([{ id: 'maint-divider_scs', name: 'maint-divider', tenants: ['scs'] }], 'maint-divider', ['bka', 'scs']);
  assert.equal(p.action, 'warn');
  assert.match(p.reason, /fork/);
  assert.match(p.reason, /\[bka\]/);
  assert.doesNotMatch(p.reason, /^WARN/);
});

test('planRow: a lone archived row doc warns, never extends or creates', () => {
  const p = planRow([{ id: 'maint-divider', name: 'maint-divider', tenants: ['bka'], isArchived: true }], 'maint-divider', ['bka', 'scs']);
  assert.equal(p.action, 'warn');
  assert.match(p.reason, /archived/);
});

test('aoc-menu_bka loses the three phase 4 names, keeps the rest in order (phase 3 names untouched)', () => {
  const p = planAocParent(AOC_BKA);
  assert.equal(p.action, 'update');
  assert.deepEqual(p.menuItems, ['aoc-data', 'aoc-statistics', 'aoc-allocation', 'aoc-srv', 'alias-spaces']);
  assert.equal(planAocParent({ ...AOC_BKA, menuItems: p.menuItems }).action, 'skip');
  assert.deepEqual(LEAVING, ['aoc-chat', 'aoc-account', 'aoc-auth']);
});

test('planAocParent tolerates phase 3 applied (statistics/bexio/srv already gone)', () => {
  const p = planAocParent({ ...AOC_BKA, menuItems: ['aoc-data', 'aoc-chat', 'aoc-account', 'aoc-auth', 'alias-spaces'] });
  assert.deepEqual(p.menuItems, ['aoc-data', 'alias-spaces']);
});

test('planLeavingRow: archive, already archived, still referenced', () => {
  assert.equal(planLeavingRow({ id: 't6gug93xhucbnrhqryb5', name: 'aoc-chat' }, []).action, 'archive');
  assert.equal(planLeavingRow({ id: 'a', name: 'aoc-auth', isArchived: true }, []).action, 'skip');
  const w = planLeavingRow({ id: 'x', name: 'aoc-account' }, [{ id: 'main_scs' }, { id: 'help' }]);
  assert.equal(w.action, 'warn');
  assert.match(w.reason, /main_scs, help/);
});

test('APPLY_ORDER: rows before contexts before parents before leaving', () => {
  assert.deepEqual(APPLY_ORDER, ['rows', 'contexts', 'parents', 'leaving']);
});

// ---- drift guard: ROW_SPECS + MAINT must equal the catalogue ----
const CATALOGUE = readFileSync(new URL('../libs/tenant/util/src/lib/feature-blocks.ts', import.meta.url), 'utf8');

test('ROW_SPECS equal the catalogue line for every name', () => {
  for (const [name, s] of Object.entries(ROW_SPECS)) {
    const re = new RegExp(`\\{ key: '${name}', name: '${name}', url: '([^']*)', action: '([^']*)', roleNeeded: '([^']*)', icon: '([^']*)', label: '([^']*)'`, 'g');
    const hits = [...CATALOGUE.matchAll(re)];
    assert.ok(hits.length >= 1, `${name} not found in feature-blocks.ts`);
    for (const m of hits) {
      assert.deepEqual({ url: m[1], action: m[2], roleNeeded: m[3], icon: m[4], label: m[5] }, { url: s.url, action: s.action, roleNeeded: s.roleNeeded, icon: s.icon, label: s.label }, name);
    }
  }
});

test('every MAINT name has a ROW_SPECS entry', () => {
  for (const n of Object.values(MAINT).flat()) assert.ok(ROW_SPECS[n], n);
});

// contextMenuChat is declared twice in the catalogue; both declarations must carry the MAINT tail.
test('MAINT is the tail of every contextMenuChat declaration in the catalogue', () => {
  const marker = "{ key: 'contextMenuChat', name: 'contextMenuChat', url: '', action: 'context'";
  let from = 0;
  let found = 0;
  for (;;) {
    const start = CATALOGUE.indexOf(marker, from);
    if (start < 0) break;
    const end = CATALOGUE.indexOf('\n    ] },', start);
    const keys = [...CATALOGUE.slice(start, end).matchAll(/\{ key: '([^']+)'/g)].map((m) => m[1]).slice(1);
    assert.deepEqual(keys.slice(-MAINT.contextMenuChat.length), MAINT.contextMenuChat, `declaration #${found + 1}`);
    found++;
    from = end;
  }
  assert.equal(found, 2);
});
