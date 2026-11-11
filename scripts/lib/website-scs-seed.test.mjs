import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWebsiteDoc, collectPageKeys, diffSite, loadFixture, parseArgs, planIsPrivate, walk } from './website-scs-seed.mjs';

const fixture = loadFixture();

test('the seed doc IS the parity fixture (nav, footer, tagline, labelI18n, homePageKey)', () => {
  const doc = buildWebsiteDoc(fixture, 'T');
  assert.deepEqual(doc.nav, fixture.nav);
  assert.deepEqual(doc.footer, fixture.footer);
  assert.equal(doc.tagline, fixture.tagline);
  assert.deepEqual(doc.taglineI18n, fixture.taglineI18n);
  assert.equal(doc.homePageKey, 'scsw_homepage');
  assert.equal(doc.draftChangedAt, 'T');
  assert.equal('okey' in doc, false);
  assert.equal('//' in doc, false);
});

test('the tree has the nested Anmeldeformulare menu, the Bootshaus page node and English labels', () => {
  const nodes = walk(buildWebsiteDoc(fixture).nav).map((x) => x.node);
  assert.ok(nodes.find((n) => n.id === 'm-anmeldeformulare')?.children.length);
  const boot = nodes.find((n) => n.pageKey === 'scsw_bootshausprojekt');
  assert.equal(boot.slug, 'bootshaus');
  assert.ok(nodes.every((n) => n.labelI18n?.en));
});

test('node ids are unique across nav and footer', () => {
  const doc = buildWebsiteDoc(fixture);
  const ids = [...walk(doc.nav), ...walk(doc.footer)].map((x) => x.node.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('collectPageKeys lists nav pages and the home page, once each', () => {
  const keys = collectPageKeys(buildWebsiteDoc(fixture)).map((k) => k.key);
  assert.ok(keys.includes('scsw_homepage') && keys.includes('scsw_bootshausprojekt'));
  assert.equal(new Set(keys).size, keys.length);
});

test('planIsPrivate splits missing / to-publish / already public', () => {
  const p = planIsPrivate(['a', 'b', 'c', 'd'], { a: { isPrivate: true }, b: { isPrivate: false }, c: null, d: {} });
  assert.deepEqual(p, { missing: ['c'], makePublic: ['a', 'd'], alreadyPublic: ['b'] });
});

test('diffSite: equal is empty, a changed label and a removed node are reported, server fields only on demand', () => {
  const doc = buildWebsiteDoc(fixture);
  assert.deepEqual(diffSite(doc, doc), []);
  const old = structuredClone(doc);
  old.nav[0].label = 'Club';
  old.nav[0].children.pop();
  old.nav.push({ id: 'l-extra', type: 'link', label: 'X', url: '/x' });
  old.hostingSite = 'other';
  const lines = diffSite(old, doc).join('\n');
  assert.match(lines, /~ nav\/m-club/);
  assert.match(lines, /\+ nav\/m-club\/p-altherren/);
  assert.match(lines, /- nav\/l-extra/);
  assert.doesNotMatch(lines, /hostingSite/);
  assert.match(diffSite(old, doc, { withServer: true }).join('\n'), /hostingSite/);
});

test('parseArgs', () => {
  assert.deepEqual(parseArgs([]), { apply: false, update: false, setHosting: false });
  assert.deepEqual(parseArgs(['--update', '--apply', '--set-hosting']), { apply: true, update: true, setHosting: true });
  assert.ok(parseArgs(['--set-hosting']).error);
  assert.ok(parseArgs(['--apply', '--dry-run']).error);
  assert.ok(parseArgs(['--x']).error);
});
