import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  APPLY_ORDER, FORK_SPLITS, HUB_ABSORBED, HUB_ROWS, RELEASE_FIRST, ROW_SPECS, SHARED_PARENT_ID, USAGE, collectRowTenants,
  gateParentOnDetach, parseArgs, planAocParent, planDetach, planFork, planLeavingRow, planRow,
} from './aoc-phase5-menu.logic.mjs';

// Live fixtures (dry-run read 2026-10-20, after the phase 3 + 4 applies).
const P = (id, tenants, menuItems, extra = {}) => ({
  id, name: 'aoc-menu', tenants, menuItems, isArchived: false, url: '', action: 'sub', roleNeeded: 'admin', icon: 'admin',
  label: '@item.aoc-menu', description: '', tags: '', data: [], index: `n:aoc-menu a:sub k:${id}`,
  ...(id === 'aoc-menu' ? {} : { forkedFrom: 'aoc-menu' }), ...extra,
});
const LIVE = {
  'aoc-menu': P('aoc-menu', ['kring', 'okr'], ['aoc-admin', 'aoc-data', 'user-all', 'aoc-sessions', 'aoc-email', 'activity-all', 'tenant-features', 'priv-register', 'priv-audit', 'divider_empty', 'workflow-all', 'ticket-all']),
  'aoc-menu_bka': P('aoc-menu_bka', ['bka'], ['aoc-admin', 'aoc-data', 'user-all', 'aoc-sessions', 'aoc-email', 'activity-all', 'tenant-features', 'aoc-allocation', 'operator-chat', 'workflow-all', 'alias-all', 'alias-spaces', 'divider_empty']),
  'aoc-menu_bkg': P('aoc-menu_bkg', ['bkg'], ['aoc-admin', 'aoc-data', 'user-all', 'aoc-sessions', 'aoc-email', 'activity-all', 'tenant-features', 'priv-register', 'priv-audit', 'workflow-all', 'ticket-all', 'divider_empty']),
  'aoc-menu_elab': P('aoc-menu_elab', ['elab'], ['aoc-admin', 'aoc-data', 'user-all', 'aoc-sessions', 'aoc-email', 'activity-all', 'tenant-features', 'priv-register', 'priv-audit', 'person-privacy']),
  'aoc-menu_kwa': P('aoc-menu_kwa', ['kwa'], ['aoc-admin', 'aoc-data', 'user-all', 'aoc-sessions', 'activity-all', 'aoc-email', 'tenant-features', 'priv-register', 'priv-audit', 'divider_empty']),
  'aoc-menu_p13': P('aoc-menu_p13', ['p13'], ['aoc-admin', 'aoc-data', 'user-all', 'aoc-sessions', 'aoc-email', 'activity-all', 'tenant-features', 'priv-register', 'priv-audit', 'workflow-all', 'ticket-all', 'divider_empty']),
  'aoc-menu_scs': P('aoc-menu_scs', ['scs'], ['aoc-admin', 'aoc-data', 'user-all', 'aoc-sessions', 'aoc-email', 'activity-all', 'tenant-features', 'priv-register', 'priv-audit', 'workflow-all', 'ticket-all', 'divider_empty']),
};
const HUB = ['aoc-access', 'aoc-ops', 'aoc-config', 'aoc-data'];
const ALL8 = ['bka', 'bkg', 'elab', 'kring', 'kwa', 'okr', 'p13', 'scs'];

test('constants: four hub rows, ten absorbed names, kring split to ops + config', () => {
  assert.deepEqual(HUB_ROWS, HUB);
  assert.deepEqual(HUB_ABSORBED, ['aoc-admin', 'aoc-sessions', 'aoc-email', 'user-all', 'priv-register', 'priv-audit', 'activity-all', 'ticket-all', 'workflow-all', 'tenant-features']);
  assert.deepEqual(FORK_SPLITS, { kring: ['aoc-ops', 'aoc-config'] });
  assert.equal(SHARED_PARENT_ID, 'aoc-menu');
});

test('each live aoc-menu* doc collapses to the four hub rows plus its extra rows, in old order', () => {
  const want = {
    'aoc-menu': [...HUB, 'divider_empty'],
    'aoc-menu_bka': [...HUB, 'aoc-allocation', 'operator-chat', 'alias-all', 'alias-spaces', 'divider_empty'],
    'aoc-menu_bkg': [...HUB, 'divider_empty'],
    'aoc-menu_elab': [...HUB, 'person-privacy'],
    'aoc-menu_kwa': [...HUB, 'divider_empty'],
    'aoc-menu_p13': [...HUB, 'divider_empty'],
    'aoc-menu_scs': [...HUB, 'divider_empty'],
  };
  for (const [id, list] of Object.entries(want)) {
    const p = planAocParent(LIVE[id]);
    assert.equal(p.action, 'update', id);
    assert.deepEqual(p.menuItems, list, id);
  }
});

test('the reason names what was dropped and added', () => {
  const p = planAocParent(LIVE['aoc-menu_elab']);
  assert.equal(p.reason, 'remove [aoc-admin, user-all, aoc-sessions, aoc-email, activity-all, tenant-features, priv-register, priv-audit]; hub [aoc-access, aoc-ops, aoc-config, aoc-data]; keep [person-privacy]');
});

test('extra rows keep their relative order even when interleaved with absorbed names', () => {
  const p = planAocParent(P('aoc-menu_x', ['x'], ['zzz', 'aoc-admin', 'aoc-data', 'yyy', 'user-all', 'aoc-ops', 'xxx']));
  assert.deepEqual(p.menuItems, [...HUB, 'zzz', 'yyy', 'xxx']);
});

test('planAocParent is idempotent on every live doc', () => {
  for (const d of Object.values(LIVE)) {
    const once = planAocParent(d);
    const again = planAocParent({ ...d, menuItems: once.menuItems });
    assert.equal(again.action, 'skip', d.id);
    assert.equal(again.reason, 'already migrated', d.id);
  }
});

test('planAocParent: archived parent warns, malformed menuItems tolerated', () => {
  const a = planAocParent({ ...LIVE['aoc-menu_scs'], isArchived: true });
  assert.equal(a.action, 'warn');
  assert.match(a.reason, /archived/);
  assert.deepEqual(planAocParent({ id: 'aoc-menu_y', name: 'aoc-menu', tenants: ['y'] }).menuItems, HUB);
});

// ---- kring split ----
const KRING_FORK = { ...P('aoc-menu_kring', ['kring'], ['aoc-ops', 'aoc-config']) };

test('kring: planFork creates aoc-menu_kring = [aoc-ops, aoc-config], fork shape of the shared doc', () => {
  const p = planFork(LIVE['aoc-menu'], [LIVE['aoc-menu']], 'kring');
  assert.equal(p.action, 'create');
  assert.equal(p.id, 'aoc-menu_kring');
  assert.deepEqual(p.doc, {
    name: 'aoc-menu', url: '', action: 'sub', roleNeeded: 'admin', icon: 'admin', label: '@item.aoc-menu',
    description: '', tags: '', data: [], isArchived: false, tenants: ['kring'], menuItems: ['aoc-ops', 'aoc-config'],
    forkedFrom: 'aoc-menu', index: 'n:aoc-menu a:sub k:aoc-menu_kring',
  });
  // Same field set as the existing forks (aoc-menu_bka read live).
  const { id: _id, ...bka } = LIVE['aoc-menu_bka'];
  assert.deepEqual(Object.keys(p.doc).sort(), Object.keys(bka).sort());
});

test('kring: planDetach removes kring from the shared doc only once the fork exists', () => {
  const before = planDetach(LIVE['aoc-menu'], [LIVE['aoc-menu']], 'kring');
  assert.equal(before.action, 'warn');
  assert.match(before.reason, /no aoc-menu_kring/);
  const p = planDetach(LIVE['aoc-menu'], [LIVE['aoc-menu'], KRING_FORK], 'kring');
  assert.equal(p.action, 'detach');
  assert.equal(p.id, 'aoc-menu');
  assert.deepEqual(p.tenants, ['okr']);
  // Dry run: the fork is only planned → planned docs count as existing for the plan.
  assert.equal(planDetach(LIVE['aoc-menu'], [LIVE['aoc-menu'], { ...KRING_FORK, planned: true }], 'kring').action, 'detach');
});

test('kring: after apply, fork, detach and the fork parent plan all skip; other hub rows never reach the fork', () => {
  const shared = { ...LIVE['aoc-menu'], tenants: ['okr'] };
  assert.equal(planFork(shared, [shared, KRING_FORK], 'kring').action, 'skip');
  assert.equal(planDetach(shared, [shared, KRING_FORK], 'kring').action, 'skip');
  const f = planAocParent(KRING_FORK);
  assert.equal(f.action, 'skip');
  assert.deepEqual(f.menuItems, ['aoc-ops', 'aoc-config']);
  // A kring-only doc with stale content: split list first, absorbed + other hub rows dropped, extras kept.
  assert.deepEqual(planAocParent({ ...KRING_FORK, menuItems: ['aoc-admin', 'aoc-data', 'divider_empty'] }).menuItems, ['aoc-ops', 'aoc-config', 'divider_empty']);
});

test('kring: a re-run on a fork with an extra row keeps that row, in order', () => {
  const fork = { ...KRING_FORK, menuItems: ['aoc-ops', 'aoc-config', 'kring-extra', 'divider_empty'] };
  const p = planAocParent(fork);
  assert.equal(p.action, 'skip');
  assert.deepEqual(p.menuItems, ['aoc-ops', 'aoc-config', 'kring-extra', 'divider_empty']);
  const moved = planAocParent({ ...fork, menuItems: ['kring-extra', 'aoc-ops', 'aoc-email', 'aoc-config'] });
  assert.equal(moved.action, 'update');
  assert.deepEqual(moved.menuItems, ['aoc-ops', 'aoc-config', 'kring-extra']);
  assert.equal(moved.reason, 'remove [aoc-email]; kring-only hub [aoc-ops, aoc-config]; keep [kring-extra]');
});

test('parents step depends on the detach: a planned but unwritten detach blocks the shared doc update', () => {
  const plan = planAocParent(LIVE['aoc-menu']);
  const det = [{ id: 'aoc-menu', action: 'detach', tenant: 'kring', tenants: ['okr'] }];
  const blocked = gateParentOnDetach(plan, det, new Set());
  assert.equal(blocked.action, 'warn');
  assert.equal(blocked.reason, 'detach of [kring] not written; parent not updated');
  assert.equal(gateParentOnDetach(plan, det, new Set(['aoc-menu'])), plan);
  // other docs, and detach plans that were skip/warn, are not gated
  const bka = planAocParent(LIVE['aoc-menu_bka']);
  assert.equal(gateParentOnDetach(bka, det, new Set()), bka);
  assert.equal(gateParentOnDetach(plan, [{ ...det[0], action: 'skip' }], new Set()), plan);
});

test('release first: --apply needs --released; usage carries the warning', () => {
  assert.match(RELEASE_FIRST, /^Run --apply only after the app release that ships the hub routes and @item\.aoc-access\/ops\/config labels is live on every app — otherwise admins lose their AOC navigation\.$/);
  assert.ok(USAGE.includes(RELEASE_FIRST));
  assert.deepEqual(parseArgs([]), { apply: false });
  assert.deepEqual(parseArgs(['--dry-run']), { apply: false });
  assert.deepEqual(parseArgs(['--apply', '--released']), { apply: true });
  assert.match(parseArgs(['--apply']).error, /--apply needs --released/);
  assert.ok(parseArgs(['--apply']).error.includes(RELEASE_FIRST));
  assert.equal(parseArgs(['--apply', '--dry-run', '--released']).error, USAGE);
  assert.equal(parseArgs(['--force']).error, USAGE);
});

test('kring: odd states warn instead of guessing', () => {
  const shared = LIVE['aoc-menu'];
  // fork exists but is archived / not kring-only / duplicated
  assert.equal(planFork(shared, [shared, { ...KRING_FORK, isArchived: true }], 'kring').action, 'warn');
  assert.equal(planFork(shared, [shared, { ...KRING_FORK, tenants: ['kring', 'okr'] }], 'kring').action, 'warn');
  assert.equal(planFork(shared, [shared, KRING_FORK, { ...KRING_FORK, id: 'zz' }], 'kring').action, 'warn');
  // shared doc is kring only → detaching would leave it tenant-less
  const only = { ...shared, tenants: ['kring'] };
  assert.equal(planFork(only, [only], 'kring').action, 'warn');
  // shared doc archived
  assert.equal(planFork({ ...shared, isArchived: true }, [shared], 'kring').action, 'warn');
  // shared doc does not list kring and no fork exists → nothing to split, but say so
  const none = { ...shared, tenants: ['okr'] };
  assert.equal(planFork(none, [none], 'kring').action, 'warn');
  assert.equal(planDetach(none, [none], 'kring').action, 'skip');
});

// ---- rows ----
const postPlan = () => {
  const docs = Object.values(LIVE).map((d) => ({ ...d, menuItems: planAocParent(d).menuItems }));
  docs[0] = { ...docs[0], tenants: ['okr'] };
  docs.push(KRING_FORK);
  return docs;
};

test('row tenants: aoc-access misses kring, aoc-ops/config/data cover all eight', () => {
  const docs = postPlan();
  assert.deepEqual(collectRowTenants(docs, 'aoc-access'), ALL8.filter((t) => t !== 'kring'));
  assert.deepEqual(collectRowTenants(docs, 'aoc-ops'), ALL8);
  assert.deepEqual(collectRowTenants(docs, 'aoc-config'), ALL8);
  assert.deepEqual(collectRowTenants(docs, 'aoc-data'), ALL8.filter((t) => t !== 'kring'));
});

test('aoc-access/ops/config are created with the catalogue fields', () => {
  for (const [name, icon] of [['aoc-access', 'shield'], ['aoc-ops', 'history'], ['aoc-config', 'settings']]) {
    const p = planRow([], name, collectRowTenants(postPlan(), name));
    assert.equal(p.action, 'create');
    assert.deepEqual(p.doc, {
      name, url: `/aoc/${name.slice(4)}`, action: 'navigate', roleNeeded: 'admin', icon, label: `@item.${name}`,
      tenants: p.tenants, menuItems: [], data: [], description: '', tags: '', isArchived: false, index: `n:${name} a:navigate k:${name}`,
    });
  }
});

test('aoc-data exists for all eight with the catalogue label → skip (never shrunk, never overwritten)', () => {
  const live = { id: 'aoc-data', name: 'aoc-data', tenants: ['bka', 'scs', 'bkg', 'kring', 'p13', 'okr', 'elab', 'kwa'], label: '@item.aoc-data', url: '/aoc/data' };
  const p = planRow([live], 'aoc-data', collectRowTenants(postPlan(), 'aoc-data'));
  assert.equal(p.action, 'skip');
});

test('planRow: a label differing from the catalogue is reported, not overwritten', () => {
  const p = planRow([{ id: 'aoc-data', name: 'aoc-data', tenants: ['scs'], label: 'Daten' }], 'aoc-data', ['scs']);
  assert.equal(p.action, 'warn');
  assert.match(p.reason, /label Daten/);
});

test('planRow WARN cases: duplicate name, lone fork, lone archived doc', () => {
  assert.equal(planRow([{ id: 'aoc-ops', tenants: [] }, { id: 'zz', tenants: [] }], 'aoc-ops', ['scs']).action, 'warn');
  const f = planRow([{ id: 'aoc-ops_scs', name: 'aoc-ops', tenants: ['scs'], label: '@item.aoc-ops' }], 'aoc-ops', ['bka', 'scs']);
  assert.equal(f.action, 'warn');
  assert.match(f.reason, /fork/);
  assert.match(f.reason, /\[bka\]/);
  const a = planRow([{ id: 'aoc-ops', name: 'aoc-ops', tenants: ['scs'], isArchived: true, label: '@item.aoc-ops' }], 'aoc-ops', ['scs']);
  assert.equal(a.action, 'warn');
  assert.match(a.reason, /archived/);
});

test('planRow: extend adds missing tenants', () => {
  const e = planRow([{ id: 'aoc-ops', name: 'aoc-ops', tenants: ['scs'], label: '@item.aoc-ops' }], 'aoc-ops', ['bka', 'scs']);
  assert.equal(e.action, 'extend');
  assert.deepEqual(e.tenants, ['bka', 'scs']);
});

// ---- archive ----
test('planLeavingRow: archive when unreferenced; WARN when a menu outside aoc-menu* lists it; skip when archived', () => {
  assert.equal(planLeavingRow({ id: 'aoc-admin', name: 'aoc-admin' }, []).action, 'archive');
  const w = planLeavingRow({ id: 'ticket-all', name: 'ticket-all' }, [{ id: '0648s2mrfurp4xgtlrn3' }]);
  assert.equal(w.action, 'warn');
  assert.equal(w.reason, 'ticket-all still listed by [0648s2mrfurp4xgtlrn3]; not archived');
  assert.equal(planLeavingRow({ id: 'x', name: 'user-all', isArchived: true }, []).action, 'skip');
});

test('APPLY_ORDER: rows, then fork, then detach (create-then-detach), then parents, then archive', () => {
  assert.deepEqual(APPLY_ORDER, ['rows', 'forks', 'detach', 'parents', 'leaving']);
});

// ---- drift guard: ROW_SPECS + HUB_ROWS + HUB_ABSORBED against the catalogue ----
const CATALOGUE = readFileSync(new URL('../libs/tenant/util/src/lib/feature-blocks.ts', import.meta.url), 'utf8');

test('ROW_SPECS cover exactly the hub rows and equal the catalogue line', () => {
  assert.deepEqual(Object.keys(ROW_SPECS), HUB);
  for (const [name, s] of Object.entries(ROW_SPECS)) {
    const re = new RegExp(`\\{ key: '${name}',\\s+name: '${name}',\\s+url: '([^']*)',\\s+action: '([^']*)',\\s+roleNeeded: '([^']*)',\\s+icon: '([^']*)',\\s+label: '([^']*)'`, 'g');
    const hits = [...CATALOGUE.matchAll(re)];
    assert.equal(hits.length, 1, `${name} in feature-blocks.ts`);
    const [m] = hits;
    assert.deepEqual({ url: m[1], action: m[2], roleNeeded: m[3], icon: m[4], label: m[5] }, s, name);
  }
});

test('HUB_ROWS is a subsequence of the catalogue aocMenuParent children', () => {
  const start = CATALOGUE.indexOf('aocMenuParent([');
  assert.ok(start >= 0);
  assert.equal(CATALOGUE.indexOf('aocMenuParent([', start + 1), -1, 'one aocMenuParent declaration');
  const end = CATALOGUE.indexOf('\n    ]),', start);
  const keys = [...CATALOGUE.slice(start, end).matchAll(/\{ key: '([^']+)'/g)].map((m) => m[1]);
  let at = -1;
  for (const n of HUB_ROWS) {
    at = keys.indexOf(n, at + 1);
    assert.ok(at >= 0, `${n} missing or out of order`);
  }
});

test('no HUB_ABSORBED name is a catalogue row any more (their live docs have no owner)', () => {
  for (const n of HUB_ABSORBED) assert.equal(CATALOGUE.includes(`key: '${n}'`), false, n);
});
