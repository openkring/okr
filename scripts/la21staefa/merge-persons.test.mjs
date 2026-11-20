// Run: node --test scripts/la21staefa/merge-persons.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mergeAdmins, parsePairs, retarget } from './merge-persons.mjs';

test('parses pairs with an optional first-name correction', () => {
  assert.deepEqual(parsePairs(['--pair', 'a:b', '--pair', 'c:d:Margret']), [{ from: 'a', to: 'b', firstName: '' }, { from: 'c', to: 'd', firstName: 'Margret' }]);
  assert.throws(() => parsePairs(['--pair', 'a:a']));
});

test('retargets an avatar to the merged person', () => {
  const av = { key: 'a', name1: 'Margreth', name2: 'Wyss', modelType: 'person', type: '', subType: '', label: 'Margreth Wyss' };
  assert.deepEqual(retarget(av, 'a', 'b', { firstName: 'Margret', lastName: 'Wyss', gender: 'female' }),
    { ...av, key: 'b', name1: 'Margret', type: 'female', label: 'Margret Wyss' });
  assert.equal(retarget({ key: 'x' }, 'a', 'b', {}).key, 'x');
});

test('two imported entries of one person become one admin', () => {
  const p = { firstName: 'Fredi', lastName: 'Wüthrich' };
  const admins = [{ key: 'b', label: 'Fredi Wüthrich' }, { key: 'a', label: 'Fredy Wüthrich' }];
  assert.deepEqual(mergeAdmins(admins, 'a', 'b', p).map((x) => x.key), ['b']);
  assert.deepEqual(mergeAdmins([{ key: 'a' }], 'a', 'b', p).map((x) => x.key), ['b']);
});
