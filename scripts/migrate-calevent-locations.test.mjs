import { test } from 'node:test';
import assert from 'node:assert/strict';

import { linkFreeText, migrateIndex, parseLocationKey, planEvent } from './migrate-calevent-locations.logic.mjs';

const known = new Map([['loc1', { name: 'Bootshaus', type: 'building' }]]);
const DELETED = 'a1b2c3d4e5f6g7h8i9j0';

const avatar = (key, text, type = '') => ({ key, name1: text, name2: '', label: text, modelType: 'location', type, subType: '' });

test('name@okey, as the form stores it', () => {
  assert.deepEqual(parseLocationKey('Bootshaus Stäfa@loc1', known), { kind: 'name@okey', locations: [avatar('loc1', 'Bootshaus Stäfa', 'building')] });
});

test('okey@name, as quick entry stored it', () => {
  assert.deepEqual(parseLocationKey('loc1@Bootshaus', known), { kind: 'okey@name', locations: [avatar('loc1', 'Bootshaus', 'building')] });
});

test('a bare okey takes the name of the location', () => {
  assert.deepEqual(parseLocationKey('loc1', known), { kind: 'okey', locations: [avatar('loc1', 'Bootshaus', 'building')] });
});

test('free text stays free text', () => {
  assert.deepEqual(parseLocationKey('Kafipause in OST', known), { kind: 'text', locations: [avatar('', 'Kafipause in OST')] });
});

test('an @ inside free text is not a key', () => {
  assert.deepEqual(parseLocationKey('Treffen @ Bahnhof', known), { kind: 'text', locations: [avatar('', 'Treffen @ Bahnhof')] });
  assert.equal(parseLocationKey('a@b@c', known).kind, 'text');
});

test('coordinates with the trailing @ of the first version of "current"', () => {
  assert.deepEqual(parseLocationKey('47.23096, 8.74921@', known), { kind: 'text', locations: [avatar('', '47.23096, 8.74921')] });
});

test('a deleted location keeps its name, as free text', () => {
  assert.deepEqual(parseLocationKey(`Alte Halle@${DELETED}`, known), { kind: 'name@deleted', locations: [avatar('', 'Alte Halle')] });
  assert.deepEqual(parseLocationKey(`${DELETED}@Alte Halle`, known), { kind: 'deleted@name', locations: [avatar('', 'Alte Halle')] });
});

test('empty', () => {
  assert.deepEqual(parseLocationKey('  ', known), { kind: 'empty', locations: [] });
  assert.deepEqual(parseLocationKey(undefined, known), { kind: 'empty', locations: [] });
});

test('migrateIndex swaps the raw value for the name, and only there', () => {
  assert.equal(migrateIndex('d:20261105 n:x p:y l:Halle@loc1 c:public', 'Halle@loc1', 'Halle'), 'd:20261105 n:x p:y l:Halle c:public');
  assert.equal(migrateIndex('d:20261105 n:Halle@loc1 c:public', 'Halle@loc1', 'Halle'), undefined);
  assert.equal(migrateIndex(undefined, 'Halle@loc1', 'Halle'), undefined);
});

test('planEvent converts, blanks the old field and fixes the index', () => {
  const plan = planEvent({ locationKey: 'Halle@loc1', index: 'n:x l:Halle@loc1 c:p' }, known, false);
  assert.equal(plan.kind, 'name@okey');
  assert.deepEqual(plan.locations, [avatar('loc1', 'Halle', 'building')]);
  assert.equal(plan.index, 'n:x l:Halle c:p');
  assert.equal(plan.clearField, 'blank');
});

test('planEvent is idempotent', () => {
  const migrated = { locationKey: '', locations: [avatar('loc1', 'Halle')] };
  assert.equal(planEvent(migrated, known, false), undefined);
  assert.equal(planEvent({ locationKey: '' }, known, false), undefined);
  assert.equal(planEvent({}, known, false), undefined);
  assert.equal(planEvent({ locations: [] }, known, true), undefined);
});

test('planEvent keeps existing locations and reports the old value as a conflict', () => {
  const plan = planEvent({ locationKey: 'Halle@loc1', locations: [avatar('', 'Neu')] }, known, false);
  assert.equal(plan.kind, 'conflict');
  assert.equal(plan.locations, undefined);
});

test('planEvent with dropField deletes the emptied field', () => {
  assert.deepEqual(planEvent({ locationKey: '', locations: [avatar('', 'Neu')] }, known, true), { kind: 'clear', clearField: 'delete' });
  assert.deepEqual(planEvent({ locationKey: '' }, known, true), { kind: 'clear', clearField: 'delete' });
  assert.equal(planEvent({ locationKey: 'Halle@loc1' }, known, true).clearField, 'delete');
});

const places = new Map([
  ['scs', { name: 'Seeclub Stäfa', type: 'logbuch', tenants: ['scs'] }],
  ['villa', { name: 'Villa Sunneschy', type: 'address', tenants: ['scs'] }],
  ['zh', { name: 'Zürich', type: 'address', tenants: ['bka'] }],
  ['old', { name: 'Alte Halle', type: 'address', tenants: ['scs'], isArchived: true }],
  ['twin1', { name: 'Halle', type: 'address', tenants: ['scs'] }],
  ['twin2', { name: 'Halle', type: 'address', tenants: ['scs'] }],
]);

test('an alias links to its location, ignoring case and spacing', () => {
  assert.equal(linkFreeText('  bootshaus ', ['scs'], places).okey, 'scs');
  assert.equal(linkFreeText('SCS', ['scs'], places).kind, 'text-alias');
  assert.equal(linkFreeText('Bootshaus,  Seestrasse 2b, Stäfa', ['scs'], places).okey, 'scs');
});

test('an alias only holds in its own tenant', () => {
  assert.equal(linkFreeText('Bootshaus', ['p13'], places), undefined);
});

test('the exact name of a location links to it, Villa Sunneschy is not the Bootshaus', () => {
  assert.deepEqual(linkFreeText('Villa Sunneschy', ['scs'], places), { kind: 'text-name', okey: 'villa', location: places.get('villa') });
});

test('a location of another tenant is not linked', () => {
  assert.equal(linkFreeText('Zürich', ['scs'], places), undefined);
});

test('an archived location is not linked', () => {
  assert.equal(linkFreeText('Alte Halle', ['scs'], places), undefined);
});

test('two locations of the same name stay free text', () => {
  assert.equal(linkFreeText('Halle', ['scs'], places), undefined);
});

test('planEvent links free text and keeps the label the event showed', () => {
  const plan = planEvent({ locationKey: 'Bootshaus', tenants: ['scs'], index: 'n:x l:Bootshaus c:p' }, places, false);
  assert.equal(plan.kind, 'text-alias');
  assert.deepEqual(plan.locations, [avatar('scs', 'Bootshaus', 'logbuch')]);
});

test('planEvent leaves unknown free text alone', () => {
  const plan = planEvent({ locationKey: 'Sarnen', tenants: ['scs'] }, places, false);
  assert.equal(plan.kind, 'text');
  assert.deepEqual(plan.locations, [avatar('', 'Sarnen')]);
});
