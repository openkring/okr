import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateSeed } from './website-seed.mjs';

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
