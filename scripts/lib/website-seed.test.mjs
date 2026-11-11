import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyObjects, validateSeed } from './website-seed.mjs';

const fixture = () => JSON.parse(readFileSync(new URL('../fixtures/website-seed.fixture.json', import.meta.url), 'utf8'));

test('the fixture seed is valid', () => {
  assert.deepEqual(validateSeed(fixture()), []);
});

test('a seed must be an object with site, pages and sections', () => {
  assert.match(validateSeed(null)[0], /object/);
  const s = fixture();
  delete s.pages;
  assert.ok(validateSeed(s).some((e) => e.includes('pages')));
});

test('site fields are checked', () => {
  const s = fixture();
  s.site.okey = 'bad key';
  s.site.hostingSite = 'scs-app';
  s.site.domain = 'http://x.org';
  s.site.languages = ['en'];
  const errors = validateSeed(s).join('\n');
  assert.match(errors, /site\.okey/);
  assert.match(errors, /site\.hostingSite/);
  assert.match(errors, /site\.domain/);
  assert.match(errors, /site\.languages/);
});

test('homePageKey must name a seeded page', () => {
  const s = fixture();
  s.site.homePageKey = 'nope';
  assert.ok(validateSeed(s).some((e) => e.includes('homePageKey')));
});

test('nav nodes: unique ids, valid types, slugs, page references', () => {
  const s = fixture();
  s.site.nav.push({ id: 'p-home', type: 'page', label: 'dup', pageKey: 'missing', slug: 'Bad Slug' });
  s.site.nav.push({ id: 'x1', type: 'weird', label: 'w' });
  s.site.nav.push({ id: 'l2', type: 'link', label: 'no url' });
  const errors = validateSeed(s).join('\n');
  assert.match(errors, /duplicate node id "p-home"/);
  assert.match(errors, /pageKey "missing"/);
  assert.match(errors, /slug/);
  assert.match(errors, /type "weird"/);
  assert.match(errors, /url/);
});

test('duplicate page slugs are rejected', () => {
  const s = fixture();
  s.site.nav.push({ id: 'p-two', type: 'page', label: 'Two', pageKey: 'p_about', slug: 'ueber' });
  s.site.nav.push({ id: 'p-three', type: 'page', label: 'Three', pageKey: 'p_about', slug: 'ueber' });
  assert.ok(validateSeed(s).some((e) => e.includes('duplicate slug "ueber"')));
});

test('a page may only list sections that are seeded (@TID@ resolves to the site tenant)', () => {
  const s = fixture();
  s.pages.p_about.sections.push('sec_missing');
  const errors = validateSeed(s);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /pages\.p_about.*sec_missing/);
});

test('sections need a type; images need path and file', () => {
  const s = fixture();
  s.sections.sec_a.type = '';
  s.images = [{ path: 'x' }];
  const errors = validateSeed(s).join('\n');
  assert.match(errors, /sections\.sec_a\.type/);
  assert.match(errors, /images\[0\]\.file/);
});

const bound = () => {
  const s = fixture();
  for (const p of Object.values(s.pages)) p.tenants = ['demo'];
  for (const x of Object.values(s.sections)) x.tenants = ['demo'];
  s.images = [{ path: 'websites/demo/images/a.jpg', file: 'images/a.jpg' }];
  return s;
};

test('a seed bound to its tenant passes', () => {
  assert.deepEqual(validateSeed(bound(), { tenant: 'demo' }), []);
});

test('binding: okey, tenants, hostingSite must belong to the tenant', () => {
  const s = bound();
  s.site.okey = 'other';
  s.site.tenants = ['demo', 'scs'];
  s.site.hostingSite = 'scs-website-54aef';
  const errors = validateSeed(s, { tenant: 'demo' }).join('\n');
  assert.match(errors, /site\.okey must be "demo"/);
  assert.match(errors, /site\.tenants must be \["demo"\]/);
  assert.match(errors, /site\.hostingSite must match demo-website/);
});

test('binding: page and section tenants must equal [tenant]', () => {
  const s = bound();
  s.pages.p_home.tenants = ['scs'];
  delete s.sections.sec_a.tenants;
  const errors = validateSeed(s, { tenant: 'demo' }).join('\n');
  assert.match(errors, /pages\.p_home\.tenants/);
  assert.match(errors, /sections\.sec_a\.tenants/);
});

test('binding: image paths stay under websites/<siteId>/images/ and never contain ..', () => {
  const s = bound();
  s.images = [
    { path: 'icons/x.png', file: 'a' },
    { path: 'websites/demo/images/../../x', file: 'b' },
    { path: 'websites/demo2/images/x', file: 'c' },
  ];
  const errors = validateSeed(s, { tenant: 'demo' });
  assert.equal(errors.filter((e) => e.includes('images[')).length, 3);
  assert.ok(errors.some((e) => e.includes('..')));
});

test('classifyObjects separates new from existing objects', async () => {
  const have = new Set(['b']);
  assert.deepEqual(await classifyObjects(['a', 'b'], async (p) => have.has(p)), { create: ['a'], overwrite: ['b'] });
});
