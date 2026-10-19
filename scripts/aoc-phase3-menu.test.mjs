import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  APPLY_ORDER, LEAVING, MAINT, ROW_SPECS, collectRowTenants, planAocParent, planContextMenu, planLeavingRow, planRow,
} from './aoc-phase3-menu.logic.mjs';

const T_ALL = ['bka', 'p13', 'scs', 'bkg', 'kring', 'elab', 'okr', 'kwa'];
const T_MEMBERSHIP = ['bka', 'p13', 'scs', 'bkg', 'kring', 'elab', 'okr'];
const MEMBERSHIP_ORIG = ['member-add', 'membership-add', 'membership-copyemail', 'membership-exportraw', 'membership-exportsrv', 'membership-exportmembers', 'membership-exportaddresses', 'membership-exportclubdesk', 'membership-sendemail'];
const PERSONS_ORIG = ['person-add', 'maint-divider', 'person-check-favaddress'];
const LIVE = {
  'c-membership': { id: 'c-membership', name: 'c-membership', tenants: T_MEMBERSHIP, menuItems: MEMBERSHIP_ORIG },
  'c-persons': { id: 'c-persons', name: 'c-persons', tenants: T_ALL, menuItems: PERSONS_ORIG },
};
const AOC_BKA = { id: 'aoc-menu_bka', name: 'aoc-menu', tenants: ['bka'], menuItems: ['aoc-data', 'aoc-statistics', 'aoc-bexio', 'aoc-allocation', 'aoc-srv', 'alias-spaces', 'aoc-chat'] };
const postPlan = () => Object.values(LIVE).map((d) => ({ ...d, menuItems: planContextMenu(d, MAINT[d.name]).menuItems }));

test('c-membership gains the four names at the end, the nine existing ones stay in order', () => {
  const p = planContextMenu(LIVE['c-membership'], MAINT['c-membership']);
  assert.equal(p.action, 'append');
  assert.deepEqual(p.menuItems.slice(0, 9), MEMBERSHIP_ORIG);
  assert.deepEqual(p.menuItems.slice(9), ['maint-divider-member', 'membership-old-juniors', 'membership-category-changes', 'membership-srv']);
});

test('c-persons gains one name after the existing phase 2 tail', () => {
  const p = planContextMenu(LIVE['c-persons'], MAINT['c-persons']);
  assert.equal(p.action, 'append');
  assert.deepEqual(p.menuItems, [...PERSONS_ORIG, 'person-bexio-contacts']);
});

test('kwa gets no c-membership row tenants', () => {
  for (const n of MAINT['c-membership']) assert.ok(!collectRowTenants(postPlan(), n).includes('kwa'), n);
});

test('maint-divider-member is created with exactly the c-membership tenants', () => {
  const p = planRow([], 'maint-divider-member', collectRowTenants(postPlan(), 'maint-divider-member'));
  assert.equal(p.action, 'create');
  assert.deepEqual(p.tenants, [...T_MEMBERSHIP].sort());
  assert.deepEqual(p.doc.tenants, [...T_MEMBERSHIP].sort());
  assert.equal(p.doc.index, 'n:maint-divider-member a:divider k:maint-divider-member');
  assert.equal(p.doc.roleNeeded, 'memberAdmin');
  assert.equal(p.doc.isArchived, false);
  assert.deepEqual(p.doc.menuItems, []);
});

test('person-bexio-contacts is created with the eight c-persons tenants', () => {
  const p = planRow([], 'person-bexio-contacts', collectRowTenants(postPlan(), 'person-bexio-contacts'));
  assert.equal(p.action, 'create');
  assert.deepEqual(p.tenants, [...T_ALL].sort());
  assert.equal(p.doc.url, '/person/bexio-contacts');
  assert.equal(p.doc.roleNeeded, 'admin');
  assert.equal(p.doc.index, 'n:person-bexio-contacts a:navigate k:person-bexio-contacts');
});

test('planContextMenu appends only the missing names, in MAINT order', () => {
  const p = planContextMenu({ id: 'c-membership', menuItems: ['member-add', 'membership-srv'] }, MAINT['c-membership']);
  assert.deepEqual(p.menuItems, ['member-add', 'membership-srv', 'maint-divider-member', 'membership-old-juniors', 'membership-category-changes']);
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

test('aoc-menu_bka loses the three leaving names, keeps the rest in place', () => {
  const p = planAocParent(AOC_BKA);
  assert.equal(p.action, 'update');
  assert.deepEqual(p.menuItems, ['aoc-data', 'aoc-allocation', 'alias-spaces', 'aoc-chat']);
  assert.equal(planAocParent({ ...AOC_BKA, menuItems: p.menuItems }).action, 'skip');
  assert.deepEqual(LEAVING, ['aoc-statistics', 'aoc-bexio', 'aoc-srv']);
});

test('planLeavingRow: archive, already archived, still referenced', () => {
  assert.equal(planLeavingRow({ id: 'ylbrzbzi00p2n8ttmqsw', name: 'aoc-bexio' }, []).action, 'archive');
  assert.equal(planLeavingRow({ id: 'a', name: 'aoc-srv', isArchived: true }, []).action, 'skip');
  const w = planLeavingRow({ id: 'cdwh5kmr0v7iogddnx0l', name: 'aoc-srv' }, [{ id: 'main_scs' }, { id: 'help' }]);
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

test('the catalogue tails are exactly the live tail plus MAINT', () => {
  const tail = (ctx) => {
    const start = CATALOGUE.indexOf(`{ key: '${ctx}', name: '${ctx}', url: '', action: 'context'`);
    const end = CATALOGUE.indexOf('\n    ] },', start);
    return [...CATALOGUE.slice(start, end).matchAll(/\{ key: '([^']+)'/g)].map((m) => m[1]).slice(1);
  };
  assert.deepEqual(tail('c-membership').slice(-4), MAINT['c-membership']);
  assert.deepEqual(tail('c-persons').slice(-3), ['maint-divider', 'person-check-favaddress', 'person-bexio-contacts']);
});
