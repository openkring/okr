import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categoryItemKeys, keyResolves, lookup } from './i18n-labels.mjs';

const bundles = { 'calendar/calevent/feature': { plural: 'Termine', empty: '', calevent_type: { ga: { label: 'GV' } } } };
const read = (scope) => bundles[scope] ?? null;

test('lookup follows nesting and keys that contain dots', () => {
  assert.equal(lookup({ a: { b: 'x' } }, 'a.b'), 'x');
  assert.equal(lookup({ 'a.b': 'x' }, 'a.b'), 'x');
  assert.equal(lookup({ a: {} }, 'a.b'), undefined);
  assert.equal(lookup(null, 'a'), undefined);
});

test('a key resolves only to non-empty text in an existing scope', () => {
  assert.equal(keyResolves('@calendar/calevent/feature.plural', read), true);
  assert.equal(keyResolves('@calendar/calevent/feature.calevent_type.ga.label', read), true);
  assert.equal(keyResolves('@calendar/calevent/feature.missing', read), false);
  assert.equal(keyResolves('@calendar/calevent/feature.empty', read), false);   // "" logs a missing key
  assert.equal(keyResolves('@calendar/calevent/feature.calevent_type', read), false);   // a block, not a label
});

test('a scope that moved away is unresolved, not skipped (SCS-EA, BKA-3)', () => {
  assert.equal(keyResolves('@calevent/feature.plural', read), false);
  assert.equal(keyResolves('@content/meeting/feature.plural', read), false);
});

test('a key the bundles cannot answer for is unresolved', () => {
  assert.equal(keyResolves('@calevent', read), false);
  assert.equal(keyResolves('@tag.bstrat', read), false);
  assert.equal(keyResolves('calendar/calevent/feature.plural', read), false);
});

test('category keys match getItemLabel', () => {
  const category = { name: 'calevent_type', i18n: '@calendar/calevent/feature', translateItems: true, items: [{ name: 'ga' }] };
  assert.deepEqual(categoryItemKeys(category), ['@calendar/calevent/feature.calevent_type.ga.label']);
});

test('a category that shows raw names asks for no keys', () => {
  assert.deepEqual(categoryItemKeys({ name: 'x', i18n: '@a/b', translateItems: false, items: [{ name: 'y' }] }), []);
  assert.deepEqual(categoryItemKeys({ name: 'x', i18n: '', translateItems: true, items: [{ name: 'y' }] }), []);
  assert.deepEqual(categoryItemKeys({ name: 'x', i18n: '@a/b', translateItems: true }), []);
});
