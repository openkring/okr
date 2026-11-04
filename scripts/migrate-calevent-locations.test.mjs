import { test } from 'node:test';
import assert from 'node:assert/strict';

import { migrateIndex, parseLocationKey, planEvent } from './migrate-calevent-locations.logic.mjs';

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
