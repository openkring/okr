import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addressKey, chunk, groupByAddress, isInside, parseCsv, personRefusal, toCsv, validateRows } from './migrate-family-households.logic.mjs';

const HEAD = 'household,personKey,firstName,lastName,payer,contact\n';

test('addressKey ignores case, outer and repeated spaces', () => {
  assert.equal(addressKey({ streetName: ' Seestrasse ', streetNumber: '4 ', zipCode: '8800' }), addressKey({ streetName: 'seestrasse', streetNumber: '4', zipCode: ' 8800' }));
  assert.equal(addressKey({ streetName: 'Alte   Landstrasse', streetNumber: '1', zipCode: '8800' }), 'alte landstrasse|1|8800');
});
test('addressKey is empty without street or zip', () => {
  assert.equal(addressKey(undefined), '');
  assert.equal(addressKey({ streetName: '', streetNumber: '1', zipCode: '8800' }), '');
  assert.equal(addressKey({ streetName: 'X', streetNumber: '1', zipCode: '' }), '');
});
test('groupByAddress groups equal keys and sets aside rows without address', () => {
  const { groups, unplaced } = groupByAddress([{ personKey: 'a', key: 'k1' }, { personKey: 'b', key: 'k1' }, { personKey: 'c', key: 'k2' }, { personKey: 'd', key: '' }]);
  assert.deepEqual(groups.map((g) => g.map((r) => r.personKey)), [['a', 'b'], ['c']]);
  assert.deepEqual(unplaced.map((r) => r.personKey), ['d']);
});
test('toCsv quotes cells and parseCsv reads them back', () => {
  const csv = toCsv([{ household: 'Familie "M", Z', personKey: 'p1', firstName: 'A', lastName: 'B', payer: 'x', contact: '' }]);
  const rows = parseCsv(csv);
  assert.equal(rows[0].household, 'Familie "M", Z');
  assert.equal(rows[0].payer, 'x');
  assert.equal(rows[0].line, 2);
});
test('parseCsv handles CRLF, BOM and blank lines; rejects a wrong header', () => {
  assert.equal(parseCsv(`﻿${HEAD.trim()}\r\n\r\nF,p1,a,b,x,x\r\n`).length, 1);
  assert.throws(() => parseCsv('a,b\n1,2\n'), /header/);
});
test('validateRows accepts a household with one contact and one payer', () => {
  const { households, refused } = validateRows(parseCsv(`${HEAD}F,p1,a,b,x,x\nF,p2,c,d,,\n`));
  assert.equal(refused.length, 0);
  assert.deepEqual(households[0], { name: 'F', memberKeys: ['p1', 'p2'], payerKey: 'p1', contactKey: 'p1', lines: [2, 3] });
});
test('validateRows: no payer is allowed (invoice per person)', () => {
  const { households } = validateRows(parseCsv(`${HEAD}F,p1,a,b,,x\nF,p2,c,d,,\n`));
  assert.equal(households[0].payerKey, '');
});
test('validateRows refuses no contact, two contacts, two payers, duplicates, single member', () => {
  const run = (body) => validateRows(parseCsv(HEAD + body)).refused.map((r) => r.reason);
  assert.deepEqual(run('F,p1,a,b,x,\nF,p2,c,d,,\n'), ['no contact']);
  assert.deepEqual(run('F,p1,a,b,,x\nF,p2,c,d,,x\n'), ['two contacts']);
  assert.deepEqual(run('F,p1,a,b,x,x\nF,p2,c,d,x,\n'), ['two payers']);
  assert.deepEqual(run('F,p1,a,b,,x\nF,p1,c,d,,\n'), ['duplicate person']);
  assert.deepEqual(run('F,p1,a,b,x,x\n'), ['fewer than two members']);
  assert.deepEqual(run(',p1,a,b,x,x\n'), ['missing household or personKey']);
});
test('validateRows keeps valid households next to refused ones', () => {
  const { households, refused } = validateRows(parseCsv(`${HEAD}A,p1,a,b,,x\nA,p2,c,d,,\nB,p3,a,b,,\nB,p4,c,d,,\n`));
  assert.equal(households.length, 1);
  assert.deepEqual(refused[0].lines, [4, 5]);
});
test('chunk splits by n', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('validateRows refuses both households when a person is in two, and reports the clashing lines', () => {
  const { households, refused } = validateRows(parseCsv(`${HEAD}A,p1,a,b,,x\nA,p2,c,d,,\nB,p2,c,d,,x\nB,p3,e,f,,\nC,p4,a,b,,x\nC,p5,c,d,,\n`));
  assert.deepEqual(households.map((h) => h.name), ['C']);
  assert.deepEqual(refused.map((r) => [r.household, r.lines, r.reason]), [['A', [3], 'person in more than one household'], ['B', [4], 'person in more than one household']]);
});
test('personRefusal: missing, archived, other tenant, fine', () => {
  assert.equal(personRefusal(undefined, 'scs'), 'person not found');
  assert.equal(personRefusal({ isArchived: true, tenants: ['scs'] }, 'scs'), 'person archived');
  assert.equal(personRefusal({ isArchived: false, tenants: ['kring'] }, 'scs'), 'person not in tenant');
  assert.equal(personRefusal({ tenants: undefined }, 'scs'), 'person not in tenant');
  assert.equal(personRefusal({ isArchived: false, tenants: ['scs', 'kring'] }, 'scs'), undefined);
});
test('isInside', () => {
  assert.equal(isInside('/repo', '/repo/x.csv'), true);
  assert.equal(isInside('/repo', '/repo2/x.csv'), false);
});
