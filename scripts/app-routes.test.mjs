// Permanent pins on the hand-written route tables of the private tenant apps. These apps are git
// submodules (empty for non-members), so each test SKIPS — not fails — when its app is not checked
// out. There is no unit-test harness for app route tables, so the routes are pinned on the source
// text, the way scripts/aoc-phase4-menu.test.mjs pins bka-app's operator routes.
//
// Run: node --test scripts/app-routes.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// kring hand-writes its table (no composeGatedFeatureRoutes), so the AOC hub routes the catalogue
// declares never reach it. Spec 1.101 phase 5: kring gets the Betrieb and Konfiguration hubs only —
// their cards there (Eskalationen, Features) are the only ones whose target routes exist in kring-app,
// and the hub's segment bar shows exactly the areas with a visible card (aoc-areas.spec pins that).
const KRING_ROUTES = new URL('../apps/kring-app/src/app/app.routes.ts', import.meta.url);
const hubRoute = area => `{ path: '${area}', canActivate: [isAdminGuard()], data: { area: '${area}' }, loadComponent: () => import('@okr/aoc-feature').then(m => m.AocHub) }`;
test('kring-app declares /aoc/ops and /aoc/config (AocHub, admin-guarded) ahead of the ** wildcard', { skip: !existsSync(KRING_ROUTES) && 'apps/kring-app not checked out' }, () => {
  const src = readFileSync(KRING_ROUTES, 'utf8');
  const parent = src.indexOf("path: 'aoc',");
  const wildcard = src.indexOf("{ path: '**'");
  assert.ok(parent > 0, "the 'aoc' parent route");
  for (const area of ['ops', 'config']) {
    const at = src.indexOf(hubRoute(area));
    assert.ok(at > parent, `/aoc/${area} under the aoc parent`);
    assert.ok(wildcard > at, `/aoc/${area} before the ** wildcard (first match wins)`);
  }
  // No Zugang or Datenqualität hub: kring has no /user, /security or data tools for their cards to open.
  for (const area of ['access', 'data']) {
    assert.equal(src.includes(`data: { area: '${area}' }`), false, `no /aoc/${area} on kring`);
  }
});
