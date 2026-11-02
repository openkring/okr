import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bump, APPS } from './release-shared.mjs';

test('bump keeps today\'s semantics', () => {
  assert.equal(bump('7.56.2', 'patch'), '7.56.3');
  assert.equal(bump('7.56.2', 'minor'), '7.57.0');
  assert.equal(bump('7.56.2', 'major'), '8.0.0');
});

test('APPS is exactly the eight tenant apps', () => {
  assert.deepEqual([...APPS].sort(), ['bka-app', 'bkg-app', 'elab-app', 'kring-app', 'kwa-app', 'okr-app', 'p13-app', 'scs-app']);
});
