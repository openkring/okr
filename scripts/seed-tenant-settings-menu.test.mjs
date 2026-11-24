import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { CLOSING_DIVIDER, PARENT_NAME, ROW_NAME, ROW_SPEC, collectTenants, parseArgs, planParent, planRow } from './seed-tenant-settings-menu.logic.mjs';

const HUB = ['aoc-access', 'aoc-ops', 'aoc-config', 'aoc-data'];
const P = (id, tenants, menuItems, extra = {}) => ({ id, name: PARENT_NAME, tenants, menuItems, isArchived: false, ...extra });
const PARENTS = [
  P('aoc-menu', ['okr', 'la21staefa'], [...HUB, 'divider_empty']),
  P('aoc-menu_kring', ['kring'], ['aoc-ops', 'aoc-config', 'divider_empty'], { forkedFrom: 'aoc-menu' }),
  P('aoc-menu_bka', ['bka'], [...HUB, 'aoc-allocation', 'alias-all', 'divider_empty'], { forkedFrom: 'aoc-menu' }),
  P('aoc-menu_elab', ['elab'], [...HUB, 'person-privacy'], { forkedFrom: 'aoc-menu' }),
];
const ALL = ['bka', 'elab', 'kring', 'la21staefa', 'okr'];

test('the row equals the catalogue line', () => {
  const catalogue = readFileSync(new URL('../libs/tenant/util/src/lib/feature-blocks.ts', import.meta.url), 'utf8');
  const re = /\{ key: 'tenant-settings',\s+name: 'tenant-settings',\s+url: '([^']*)',\s+action: '([^']*)',\s+roleNeeded: '([^']*)',\s+icon: '([^']*)',\s+label: '([^']*)'/g;
  const hits = [...catalogue.matchAll(re)];
  assert.equal(hits.length, 1);
  const [m] = hits;
  assert.deepEqual({ url: m[1], action: m[2], roleNeeded: m[3], icon: m[4], label: m[5] }, ROW_SPEC);
  assert.ok(catalogue.includes(`key: '${CLOSING_DIVIDER}'`));
});

test('the tenants are the union of all live submenus, forks included, archived ones not', () => {
  assert.deepEqual(collectTenants(PARENTS), ALL);
  assert.deepEqual(collectTenants([...PARENTS, P('old', ['gone'], [], { isArchived: true }), P('x', undefined, undefined)]), ALL);
});

test('row: create, extend, skip', () => {
  const create = planRow([], ALL);
  assert.equal(create.action, 'create');
  assert.deepEqual(create.doc.tenants, ALL);
  assert.equal(create.doc.name, ROW_NAME);
  assert.equal(create.doc.isArchived, false);
  const extend = planRow([{ id: ROW_NAME, name: ROW_NAME, tenants: ['kwa', 'bka'] }], ALL);
  assert.equal(extend.action, 'extend');
  assert.deepEqual(extend.missing, ['elab', 'kring', 'la21staefa', 'okr']);
  assert.deepEqual(extend.tenants, ['bka', 'elab', 'kring', 'kwa', 'la21staefa', 'okr']);
  assert.equal(planRow([{ id: ROW_NAME, tenants: ALL }], ALL).action, 'skip');
});

test('row: archived, fork, duplicate and no submenu warn and cover nobody new', () => {
  for (const existing of [[{ id: ROW_NAME, tenants: ALL, isArchived: true }], [{ id: ROW_NAME, tenants: ALL }, { id: 'x', tenants: ['bka'] }]]) {
    const p = planRow(existing, ALL);
    assert.equal(p.action, 'warn');
    assert.deepEqual(p.tenants, []);
  }
  const fork = planRow([{ id: 'tenant-settings_bka', tenants: ['bka'] }], ALL);
  assert.equal(fork.action, 'warn');
  assert.deepEqual(fork.tenants, ['bka']);
  assert.equal(planRow([], []).action, 'warn');
});

test('submenu: inserted before the closing divider, at the end without one, other entries keep their order', () => {
  const want = [
    [...HUB, ROW_NAME, 'divider_empty'],
    ['aoc-ops', 'aoc-config', ROW_NAME, 'divider_empty'],
    [...HUB, 'aoc-allocation', 'alias-all', ROW_NAME, 'divider_empty'],
    [...HUB, 'person-privacy', ROW_NAME],
  ];
  PARENTS.forEach((d, i) => {
    const p = planParent(d, ALL);
    assert.equal(p.action, 'update', d.id);
    assert.deepEqual(p.menuItems, want[i], d.id);
  });
  assert.deepEqual(planParent(P('x', ['bka'], ['divider_empty', 'a', 'divider_empty']), ALL).menuItems, ['divider_empty', 'a', ROW_NAME, 'divider_empty']);
  assert.deepEqual(planParent(P('x', ['bka'], undefined), ALL).menuItems, [ROW_NAME]);
});

test('submenu: never duplicated, idempotent, a row behind the divider stays where it is', () => {
  for (const d of PARENTS) assert.equal(planParent({ ...d, menuItems: planParent(d, ALL).menuItems }, ALL).action, 'skip', d.id);
  const behind = planParent(P('x', ['bka'], ['divider_empty', ROW_NAME]), ALL);
  assert.equal(behind.action, 'skip');
  assert.deepEqual(behind.menuItems, ['divider_empty', ROW_NAME]);
});

test('submenu: left alone when archived or when the row does not cover one of its tenants', () => {
  assert.equal(planParent(P('x', ['bka'], HUB, { isArchived: true }), ALL).action, 'warn');
  const p = planParent(P('x', ['bka', 'new'], HUB), ALL);
  assert.equal(p.action, 'warn');
  assert.match(p.reason, /\[new\]/);
  for (const d of PARENTS) assert.equal(planParent(d, planRow([{ id: ROW_NAME, isArchived: true }], ALL).tenants).action, 'warn');
});

test('args: dry run by default, --apply explicit', () => {
  assert.deepEqual(parseArgs([]), { apply: false });
  assert.deepEqual(parseArgs(['--dry-run']), { apply: false });
  assert.deepEqual(parseArgs(['--apply']), { apply: true });
  assert.deepEqual(parseArgs(['--apply', '--allow-unreleased-labels']), { apply: true });
  assert.ok(parseArgs(['--apply', '--dry-run']).error);
  assert.ok(parseArgs(['--aply']).error);
});
