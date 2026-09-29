import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commitOps } from './steps.mjs';

function fakeDb() {
  const commits = [];
  return {
    commits,
    batch() {
      const ops = [];
      return { set: (ref, data, opt) => ops.push(['set', ref, data, opt]), delete: (ref) => ops.push(['del', ref]), commit: async () => commits.push(ops) };
    },
  };
}

test('commitOps chunks by 400 and merges sets', async () => {
  const db = fakeDb();
  const ops = Array.from({ length: 401 }, (_, i) => ({ ref: `r${i}`, data: { i } }));
  ops.push({ ref: 'gone', del: true });
  assert.equal(await commitOps(db, ops, false), 402);
  assert.deepEqual(db.commits.map(c => c.length), [400, 2]);
  assert.deepEqual(db.commits[0][0], ['set', 'r0', { i: 0 }, { merge: true }]);
  assert.deepEqual(db.commits[1][1], ['del', 'gone']);
});

test('commitOps in dry mode writes nothing', async () => {
  const db = fakeDb();
  assert.equal(await commitOps(db, [{ ref: 'a', data: {} }], true), 1);
  assert.equal(db.commits.length, 0);
});
