import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fixTypes, fixUndefinedFields, planFix } from './fix-models.logic.mjs';

test('an undefined field gets its default (typed)', () => {
  const doc = { okey: 'a' };
  fixUndefinedFields(doc, ['s:name=foo', 'n:prio=3', 'b:on=true', 'b:off', 'm:meta', 'a:list', 's:empty', 'n:zero']);
  assert.deepEqual(doc, { okey: 'a', name: 'foo', prio: 3, on: true, off: false, meta: {}, list: [], empty: '', zero: 0 });
});

test('a null field also gets its default; a present field is untouched', () => {
  const doc = { name: null, prio: 7 };
  fixUndefinedFields(doc, ['s:name=x', 'n:prio=1']);
  assert.deepEqual(doc, { name: 'x', prio: 7 });
});

test('a correctly typed field is untouched by fixTypes', () => {
  const doc = { n: 5, s: 'x', b: true, a: [1], m: { k: 1 } };
  fixTypes(doc, ['n:n', 's:s', 'b:b', 'a:a', 'm:m']);
  assert.deepEqual(doc, { n: 5, s: 'x', b: true, a: [1], m: { k: 1 } });
});

test('fixTypes converts a string number, a number to string, a string to bool', () => {
  const doc = { n: '12', e: '', s: 4, b: 'true', c: 'no' };
  fixTypes(doc, ['n:n', 'n:e', 's:s', 'b:b', 'b:c']);
  assert.deepEqual(doc, { n: 12, e: 0, s: '4', b: true, c: false });
});

test('fixTypes wraps a string into an array and replaces non-arrays / non-maps', () => {
  const doc = { a: 'x', a2: 5, m: 'y', m2: null };
  fixTypes(doc, ['a:a', 'a:a2', 'm:m', 'm:m2']);
  assert.deepEqual(doc, { a: ['x'], a2: [], m: ['y'], m2: {} });
});

test('planFix merges the custom patch with the other fixes', () => {
  const r = planFix({ okey: 'a', n: '2' }, { typeSpec: ['n:n'], defaults: ['s:t=z'], custom: () => ({ extra: 1 }) });
  assert.equal(r.changed, true);
  assert.deepEqual(r.patch, { n: 2, t: 'z', extra: 1 });
});

test('an unchanged doc yields changed false and an empty patch', () => {
  const doc = { okey: 'a', n: 2 };
  const r = planFix(doc, { typeSpec: ['n:n'], defaults: ['n:n=1'] });
  assert.deepEqual(r, { changed: false, patch: {} });
  assert.deepEqual(doc, { okey: 'a', n: 2 });
});

test('planFix never patches okey and does not mutate the input', () => {
  const doc = { okey: 'a', n: '2' };
  const r = planFix(doc, { typeSpec: ['n:n'], custom: () => ({ okey: 'zzz' }) });
  assert.equal('okey' in r.patch, false);
  assert.equal(doc.n, '2');
});

test('planFix: an in-place nested hook mutation is detected and the input doc stays untouched', () => {
  const doc = { okey: 'a', admin: 'x', admins: ['y'] };
  const snapshot = structuredClone(doc);
  const res = planFix(doc, { custom: (d) => { d.admins.push(d.admin); return { admins: d.admins }; } });
  assert.equal(res.changed, true);
  assert.deepEqual(res.patch, { admins: ['y', 'x'] });
  assert.deepEqual(doc, snapshot);
});

test('planFix: a field structuredClone cannot copy does not throw and stays out of the patch', () => {
  const doc = { okey: 'a', ref: { fn() {} }, n: '3' };
  const res = planFix(doc, { typeSpec: ['n:n'] });
  assert.deepEqual(res.patch, { n: 3 });
  assert.equal(res.changed, true);
});
