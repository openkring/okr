// Run: node --test scripts/la21staefa/import-people.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalisePhone, normaliseWeb, parentOf, rolePriority } from './import-people.mjs';

test('maps old pages and subpages to groups, verein to the org', () => {
  assert.equal(parentOf('verein'), 'org.la21staefa');
  assert.equal(parentOf('https://www.la21staefa.ch/smaert/'), 'group.la21staefa_smart');
  assert.equal(parentOf('https://www.la21staefa.ch/btvz-start/kreiswerk/'), 'group.la21staefa_btvzbauteilezur');
  assert.equal(parentOf('https://www.la21staefa.ch/nettswerk-treff/'), 'group.la21staefa_begegnungintegr');
  assert.equal(parentOf('https://www.la21staefa.ch/unbekannt/'), '');
});

test('lead and contact roles come first', () => {
  assert.equal(rolePriority('Leitung'), 0);
  assert.equal(rolePriority('Kontaktperson'), 0);
  assert.equal(rolePriority('Projektgruppe'), 1);
});

test('normalises phones and web addresses', () => {
  assert.equal(normalisePhone('078 218 02 66'), '+41 78 218 02 66');
  assert.equal(normalisePhone('+41 78 218 02 66'), '+41 78 218 02 66');
  assert.equal(normalisePhone('12'), '');
  assert.equal(normaliseWeb('http://andreas-erni.ch/'), 'https://andreas-erni.ch/');
  assert.equal(normaliseWeb('javascript:x'), '');
});

test('a role naming Qatira belongs to the Qatira group', () => {
  assert.equal(parentOf('https://www.la21staefa.ch/begegnung-und-integration/', 'Kontakt Qatira'), 'group.la21staefa_qatira');
});
