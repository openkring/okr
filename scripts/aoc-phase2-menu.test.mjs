import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  APPLY_ORDER, LEAVING, MAINT, ROW_SPECS, collectRowTenants, planAocParent, planContextMenu, planLeavingRow, planRow,
} from './aoc-phase2-menu.logic.mjs';

const T_ALL = ['bka', 'p13', 'scs', 'bkg', 'kring', 'elab', 'okr', 'kwa'];
const TRIPS_SCS_ORIG = ['trip-add', 'trip-boatstats', 'trip-personstats', 'trip-exportraw', 'trip-togglelock', 'filter-toggle', 'divider_empty'];
const LIVE = {
  'c-calevents': { id: 'c-calevents', name: 'c-calevents', tenants: T_ALL, menuItems: ['calevent-add', 'filter-toggle'] },
  'c-groups': { id: 'c-groups', name: 'c-groups', tenants: T_ALL, menuItems: ['group-add'] },
  'c-persons': { id: 'c-persons', name: 'c-persons', tenants: T_ALL, menuItems: ['person-add'] },
  'c-pages': { id: 'c-pages', name: 'c-pages', tenants: T_ALL, menuItems: ['page-add', 'page-exportraw'] },
  'c-documents': { id: 'c-documents', name: 'c-documents', tenants: T_ALL, menuItems: ['files-add'] },
  'c-trips': { id: 'c-trips', name: 'c-trips', tenants: ['okr'], menuItems: ['trip-add', 'trip-boatstats'] },
  'c-trips_scs': { id: 'c-trips_scs', name: 'c-trips', tenants: ['scs'], menuItems: TRIPS_SCS_ORIG },
  'c-diary': { id: 'c-diary', name: 'c-diary', tenants: ['bka'], menuItems: ['diary-add', 'diary-period'] },
};
const AOC_BKA = { id: 'aoc-menu_bka', name: 'aoc-menu', tenants: ['bka'], menuItems: ['aoc-data', 'aoc-content', 'aoc-doc', 'aoc-allocation', 'aoc-diary', 'aoc-kiosk', 'alias-spaces', 'aoc-chat'] };

test('c-trips_scs gains the four trip names at the end, original seven first and in order', () => {
  const p = planContextMenu(LIVE['c-trips_scs'], MAINT['c-trips']);
  assert.equal(p.action, 'append');
  assert.deepEqual(p.menuItems.slice(0, 7), TRIPS_SCS_ORIG);
  assert.deepEqual(p.menuItems.slice(7), ['maint-divider-trip', 'trip-maintenance', 'maint-divider', 'trip-kiosk']);
});

test('planContextMenu appends only the missing names, in MAINT order', () => {
  const p = planContextMenu({ id: 'c-groups', menuItems: ['group-add', 'group-chat-members'] }, MAINT['c-groups']);
  assert.deepEqual(p.menuItems, ['group-add', 'group-chat-members', 'maint-divider', 'group-check-hygiene', 'group-chat-postpolicy', 'group-chat-guests']);
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

test('a tenant without a c-diary doc gets no diary row tenant', () => {
  const docs = Object.values(LIVE).map((d) => (planContextMenu(d, MAINT[d.name]).menuItems ? { ...d, menuItems: planContextMenu(d, MAINT[d.name]).menuItems } : d));
  assert.deepEqual(collectRowTenants(docs, 'diary-import'), ['bka']);
  assert.deepEqual(collectRowTenants(docs, 'trip-kiosk'), ['okr', 'scs']);
});

test('planRow for maint-divider collects the tenants from every context menu that uses it', () => {
  const docs = Object.values(LIVE).map((d) => ({ ...d, menuItems: planContextMenu(d, MAINT[d.name]).menuItems }));
  const tenants = collectRowTenants(docs, 'maint-divider');
  assert.deepEqual(tenants, [...T_ALL].sort());
  const p = planRow([], 'maint-divider', tenants);
  assert.equal(p.action, 'create');
  assert.equal(p.id, 'maint-divider');
  assert.deepEqual(p.tenants, [...T_ALL].sort());
  assert.equal(p.doc.index, 'n:maint-divider a:divider k:maint-divider');
  assert.equal(p.doc.isArchived, false);
  assert.deepEqual(p.doc.menuItems, []);
  assert.equal(p.doc.roleNeeded, 'admin');
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

test('planRow: a fork row doc (id differs from name) is not touched', () => {
  const p = planRow([{ id: 'maint-divider_scs', name: 'maint-divider', tenants: ['scs'] }], 'maint-divider', ['bka']);
  assert.equal(p.action, 'skip');
  assert.match(p.reason, /fork/);
});

test('aoc-menu_bka loses the four leaving names, keeps the rest in place', () => {
  const p = planAocParent(AOC_BKA);
  assert.equal(p.action, 'update');
  assert.deepEqual(p.menuItems, ['aoc-data', 'aoc-allocation', 'alias-spaces', 'aoc-chat']);
  assert.equal(planAocParent({ ...AOC_BKA, menuItems: p.menuItems }).action, 'skip');
  assert.deepEqual(LEAVING, ['aoc-content', 'aoc-doc', 'aoc-diary', 'aoc-kiosk']);
});

test('planLeavingRow: archive, already archived, still referenced', () => {
  assert.equal(planLeavingRow({ id: 'nl8b189wb4voq9svd3s9', name: 'aoc-doc' }, []).action, 'archive');
  assert.equal(planLeavingRow({ id: 'a', name: 'aoc-doc', isArchived: true }, []).action, 'skip');
  const w = planLeavingRow({ id: 'a', name: 'aoc-doc' }, [{ id: 'main_scs' }, { id: 'help' }]);
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

test('MAINT equals the tail of each context menu in the catalogue', () => {
  for (const [ctx, names] of Object.entries(MAINT)) {
    const start = CATALOGUE.indexOf(`{ key: '${ctx}', name: '${ctx}', url: '', action: 'context'`);
    assert.ok(start >= 0, ctx);
    const end = CATALOGUE.indexOf('\n    ] },', start);
    const keys = [...CATALOGUE.slice(start, end).matchAll(/\{ key: '([^']+)'/g)].map((m) => m[1]).slice(1);
    assert.deepEqual(keys.slice(-names.length), names, ctx);
  }
});
