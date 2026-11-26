import assert from 'node:assert/strict';
import { test } from 'node:test';

import { appMenus, navWithSubprojects, rootWithProjects, withoutMoved } from './project-subpages.mjs';

const page = (slug, pageKey, label = slug) => ({ id: `n-${slug}`, type: 'page', label, pageKey, slug });
const NAV = [{ id: 'n-projektgruppen', type: 'menu', label: 'Projektgruppen', url: '/projektgruppen', children: [
  page('projektgruppen', 'la21staefa_projektgruppen'),
  page('begegnung-und-integration', 'la21staefa_begegnungintegr_content', 'Begegnung & Integration'),
  page('btvz-bauteile-zurichsee', 'la21staefa_btvzbauteilezur_content', 'BTVZ'),
  page('qatira', 'la21staefa_qatira_content', 'Qatira'),
  page('smart', 'la21staefa_smart_content', 'SMäRT'),
] }, page('termine', 'la21staefa_termine')];

test('a project with sub-projects becomes a menu linking to its page; Qatira moves under Begegnung', () => {
  const kids = navWithSubprojects(NAV)[0].children;
  assert.deepEqual(kids.map((k) => k.label), ['projektgruppen', 'Begegnung & Integration', 'BTVZ', 'SMäRT']);
  const bi = kids[1];
  assert.equal(bi.type, 'menu');
  assert.equal(bi.url, '/begegnung-und-integration');
  assert.deepEqual(bi.children.map((c) => c.slug), ['begegnung-und-integration', 'nettswerk-treff', 'qatira']);
  assert.equal(bi.children[2].id, 'n-qatira'); // the existing node is kept
});

test('the nav change is idempotent and leaves other menus alone', () => {
  const once = navWithSubprojects(NAV);
  assert.deepEqual(navWithSubprojects(once), once);
  assert.equal(once[1], NAV[1]);
});

test('moved sections leave the page only while all of them are still listed', () => {
  assert.deepEqual(withoutMoved(['a', 'b', 'c'], ['b', 'c']), ['a']);
  const done = ['a'];
  assert.equal(withoutMoved(done, ['b', 'c']), done);
  assert.equal(withoutMoved(['a', 'b'], ['b', 'c']), null);
});

test('app menu names are unique and the root gets «Projektgruppen» after «Verein» once', () => {
  const names = appMenus(navWithSubprojects(NAV)).map((d) => d.name);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes('la21staefa-pg-smart-menu') && names.includes('la21staefa-pg-smart'));
  const root = rootWithProjects(['dashboard', 'la21staefa-verein', 'album']);
  assert.deepEqual(root, ['dashboard', 'la21staefa-verein', 'la21staefa-projekte', 'album']);
  assert.equal(rootWithProjects(root), root);
});
