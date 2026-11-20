// Run: node --test scripts/la21staefa/create-group-memberships.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { membershipOf } from './create-group-memberships.mjs';

test('an active, open-ended group membership of the admin', () => {
  const m = membershipOf({ key: 'la21staefa_qatira', name: 'Qatira' }, { key: 'p1', name1: 'Daniel', name2: 'Fabian', type: '' }, '20261120');
  assert.equal(m.orgModelType, 'group');
  assert.equal(m.memberModelType, 'person');
  assert.equal(m.dateOfExit, '99991231');
  assert.equal(m.relLog, '20261120:A');
  assert.deepEqual(m.tenants, ['la21staefa']);
});
