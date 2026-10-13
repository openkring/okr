import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OPERATOR_URL, planParentDocs, planRowDocs } from './restrict-allocation-to-bka.logic.mjs';

test('the shared row is restricted to bka and gets the operator url', () => {
  const [p] = planRowDocs([{ id: 'r1', tenants: ['scs', 'bka', 'p13'], url: '/aoc/allocation' }]);
  assert.equal(p.action, 'restrict');
});

test('a row already restricted is skipped (idempotent re-run)', () => {
  const [p] = planRowDocs([{ id: 'r1', tenants: ['bka'], url: OPERATOR_URL }]);
  assert.equal(p.action, 'skip');
});

test('a row restricted but still on the old url is restricted again (url only)', () => {
  const [p] = planRowDocs([{ id: 'r1', tenants: ['bka'], url: '/aoc/allocation' }]);
  assert.equal(p.action, 'restrict');
});

test('a fork owned by another tenant is a conflict, never rewritten', () => {
  const [p] = planRowDocs([{ id: 'f1', tenants: ['scs'], url: '/aoc/allocation', forkedFrom: 'aoc-allocation' }]);
  assert.equal(p.action, 'conflict');
});

test('non-bka parents drop the row, bka keeps it', () => {
  const plans = planParentDocs([
    { id: 'aoc-menu', tenants: ['kring', 'okr'], menuItems: ['aoc-admin', 'aoc-allocation'] },
    { id: 'aoc-menu_bka', tenants: ['bka'], menuItems: ['aoc-allocation'] },
    { id: 'aoc-menu_scs', tenants: ['scs'], menuItems: ['aoc-admin'] },
  ]);
  assert.deepEqual(plans.map(p => [p.id, p.action]), [['aoc-menu', 'detach'], ['aoc-menu_bka', 'skip'], ['aoc-menu_scs', 'skip']]);
});

test('a parent shared by bka and another tenant is a conflict', () => {
  const [p] = planParentDocs([{ id: 'x', tenants: ['bka', 'scs'], menuItems: ['aoc-allocation'] }]);
  assert.equal(p.action, 'conflict');
});

test('malformed fields never crash the plan', () => {
  assert.equal(planRowDocs([{ id: 'r', tenants: undefined, url: undefined }])[0].action, 'restrict');
  assert.equal(planParentDocs([{ id: 'p', tenants: undefined, menuItems: undefined }])[0].action, 'skip');
});
