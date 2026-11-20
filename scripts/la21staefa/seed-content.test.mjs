// Run: node --test scripts/la21staefa/seed-content.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { GROUPS, groupKey, navWithGroups, plan, slugOf } from './seed-content.mjs';

test('group keys follow getGroupKeyFromName and are unique', () => {
  assert.equal(groupKey('Reparatur Café Stäfa'), 'la21staefa_reparaturcafest');
  const keys = GROUPS.map((g) => groupKey(g.name));
  assert.equal(new Set(keys).size, GROUPS.length);
});

test('group names fit the 30-character cap of the group form', () => {
  for (const g of GROUPS) assert.ok(g.name.length <= 30, g.name);
  for (const g of GROUPS) assert.ok(g.teaser.length <= 100, g.teaser);
  for (const g of GROUPS) assert.match(g.color, /^#[0-9a-f]{6}$/i);
});

test('slugs are url-safe', () => {
  assert.equal(slugOf('Begegnung & Integration'), 'begegnung-und-integration');
  assert.equal(slugOf('Lokal + Fair'), 'lokal-fair');
});

test('every group gets group, calendar, avatar, intro section and a public content page', () => {
  const { docs } = plan();
  const key = groupKey('KISS Stäfa');
  for (const p of [`groups/${key}`, `calendars/${key}`, `avatars/la21staefa.group.${key}`, `sections/g-${key}`, `pages/${key}_content`]) assert.ok(docs.has(p), p);
  assert.equal(docs.get(`pages/${key}_content`).isPrivate, false);
  assert.equal(docs.get(`sections/la21staefa_home_slideshow`).properties.slideshow.effect, 'fade');
});

test('the nav menu is added once', () => {
  const nav = navWithGroups([{ id: 'n-termine' }]);
  assert.equal(nav[0].children.length, 12);
  assert.equal(navWithGroups(nav), nav);
});
