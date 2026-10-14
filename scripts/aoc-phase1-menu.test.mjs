import { test } from 'node:test';
import assert from 'node:assert/strict';

import { insertAfter, planAocParent, planEmailRow, planRootDoc, planStorageRow } from './aoc-phase1-menu.logic.mjs';

const LIVE = ['aoc-data', 'aoc-doc', 'aoc-storage', 'aoc-account', 'flighttracker', 'divider_empty', 'aoc-sessions'];

test('insertAfter: after aoc-doc', () => {
  assert.deepEqual(insertAfter(['a', 'aoc-doc', 'b'], 'x', ['aoc-doc']), ['a', 'aoc-doc', 'x', 'b']);
});
test('insertAfter: before divider_empty without anchor', () => {
  assert.deepEqual(insertAfter(['a', 'divider_empty', 'b'], 'x', ['aoc-doc']), ['a', 'x', 'divider_empty', 'b']);
});
test('insertAfter: at the end otherwise', () => {
  assert.deepEqual(insertAfter(['a', 'b'], 'x', ['aoc-doc']), ['a', 'b', 'x']);
});
test('insertAfter: idempotent', () => {
  const once = insertAfter(['a', 'aoc-doc'], 'x', ['aoc-doc']);
  assert.deepEqual(insertAfter(once, 'x', ['aoc-doc']), once);
});

test('planAocParent removes only storage + flight, inserts email after aoc-doc, keeps order', () => {
  const p = planAocParent({ id: 'aoc-menu_scs', tenants: ['scs'], menuItems: LIVE });
  assert.equal(p.action, 'update');
  assert.deepEqual(p.menuItems, ['aoc-data', 'aoc-doc', 'aoc-email', 'aoc-account', 'divider_empty', 'aoc-sessions']);
  assert.deepEqual(p.flightTenants, ['scs']);
});
test('planAocParent: only aoc-storage removed leaves others', () => {
  const p = planAocParent({ id: 'x', tenants: ['scs'], menuItems: ['aoc-data', 'aoc-doc', 'aoc-storage', 'aoc-account'] });
  assert.deepEqual(p.menuItems, ['aoc-data', 'aoc-doc', 'aoc-email', 'aoc-account']);
  assert.deepEqual(p.flightTenants, []);
});
test('planAocParent: second plan is skip', () => {
  const p = planAocParent({ id: 'x', tenants: ['scs'], menuItems: LIVE });
  assert.equal(planAocParent({ id: 'x', tenants: ['scs'], menuItems: p.menuItems }).action, 'skip');
});
test('planAocParent: malformed menuItems does not throw', () => {
  const p = planAocParent({ id: 'x' });
  assert.deepEqual(p.menuItems, ['aoc-email']);
});

test('planRootDoc: append, skip when present, skip when tenant had none', () => {
  assert.equal(planRootDoc({ id: 'main_bka', tenants: ['bka'], menuItems: ['a'] }, ['bka']).action, 'append');
  assert.deepEqual(planRootDoc({ id: 'main_bka', tenants: ['bka'], menuItems: ['a'] }, ['bka']).menuItems, ['a', 'flighttracker']);
  assert.equal(planRootDoc({ id: 'm', tenants: ['bka'], menuItems: ['flighttracker'] }, ['bka']).action, 'skip');
  assert.equal(planRootDoc({ id: 'm', tenants: ['scs'], menuItems: [] }, ['bka']).action, 'skip');
});

test('planStorageRow: archive / skip', () => {
  assert.equal(planStorageRow({ id: 's' }).action, 'archive');
  assert.equal(planStorageRow({ id: 's', isArchived: true }).action, 'skip');
});

test('planEmailRow: create, skip, extend', () => {
  assert.deepEqual(planEmailRow(undefined, ['scs', 'bka', 'bka']).tenants, ['bka', 'scs']);
  assert.equal(planEmailRow({ id: 'aoc-email', tenants: ['bka', 'scs'] }, ['scs', 'bka']).action, 'skip');
  const e = planEmailRow({ id: 'aoc-email', tenants: ['bka'] }, ['scs', 'bka']);
  assert.equal(e.action, 'extend');
  assert.deepEqual(e.tenants, ['bka', 'scs']);
});
