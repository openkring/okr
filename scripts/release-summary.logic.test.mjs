import { test } from 'node:test';
import assert from 'node:assert/strict';
import { definedNames, groupCommits, isNoise, localImports, parseCommits, previousTag, reachable, renderReport, rolloutHints, staleFunctions,
  stepScripts, tocItems } from './release-summary.logic.mjs';

const commit = (subject, body = '') => parseCommits(`abc\x1f${subject}\x1f${body}\x1e`)[0];

test('previousTag compares numerically and skips foreign tags', () => {
  assert.equal(previousTag(['v7.9.0', 'v7.10.0', 'v7.10.1', 'nightly'], '7.10.1'), 'v7.10.0');
  assert.equal(previousTag(['v7.9.0', 'v7.10.0'], '7.11.0'), 'v7.10.0');
  assert.equal(previousTag(['v7.57.0'], '7.57.0'), null);
});

test('parseCommits reads the spec number in its usual spellings, never a version', () => {
  assert.equal(commit('feat(forms): rule editor (1.125 B)').spec, '1.125');
  assert.equal(commit('fix(course): lock (spec 1.132 §6)').spec, '1.132');
  assert.equal(commit('feat(srv): 1.133 preview').spec, '1.133');
  assert.equal(commit('fix(chat): a DM of v7.57.0 is no longer stuck').spec, '');
});

test('isNoise drops bookkeeping and keeps user-facing commits', () => {
  assert.equal(isNoise(commit('chore(submodules): Pointer -- planning')), true);
  assert.equal(isNoise(commit('release: v7.57.0')), true);
  assert.equal(isNoise(commit('feat(calevent): link')), false);
  assert.equal(isNoise(commit('chore(forms): seed script')), false);
});

test('groupCommits prefers the spec and sorts the biggest topic first', () => {
  const groups = groupCommits([commit('fix(chat): x'), commit('feat(a): y (1.1)'), commit('fix(b): z (1.1)')]);
  assert.deepEqual(groups.map((g) => [g.key, g.commits.length]), [['1.1', 2], ['chat', 1]]);
});

test('rolloutHints finds the announcements in a body', () => {
  const hints = rolloutHints([commit('fix(x): y', 'Answer link (needs a functions deploy):\nplain line\nRelease order: apps, then the backfill.')]);
  assert.equal(hints.length, 2);
});

test('stepScripts keeps runnable steps only', () => {
  assert.deepEqual(stepScripts(['scripts/migrate-a.mjs', 'scripts/migrate-a.logic.mjs', 'scripts/backfill-b.ts', 'scripts/release.mjs', 'apps/x.ts']),
    ['scripts/backfill-b.ts', 'scripts/migrate-a.mjs']);
});

test('definedNames ignores barrels', () => {
  assert.deepEqual(definedNames(`export const a = 1;\nexport { b } from './x';\nexport function e() {}`), ['a', 'e']);
});

test('localImports keeps relative value imports across lines', () => {
  const src = `import { a } from 'pkg';\nimport {\n  b,\n} from './b';\nimport type { C } from './c';\nexport { d } from '../d';`;
  assert.deepEqual(localImports(src), ['./b', '../d']);
});

test('reachable follows imports and survives a cycle', () => {
  assert.deepEqual([...reachable('a', { a: ['b'], b: ['c', 'a'] })], ['a', 'b', 'c']);
});

test('staleFunctions flags a function through a changed import, and only when older', () => {
  const functions = [{ name: 'old', files: ['a', 'helper'] }, { name: 'fresh', files: ['b', 'helper'] }, { name: 'clean', files: ['c'] }];
  const stale = staleFunctions(functions, { helper: '2026-11-04T12:00:00Z' },
    { old: '2026-10-30T18:00:00Z', fresh: '2026-11-05T08:00:00Z', clean: '2026-10-30T18:00:00Z' });
  assert.deepEqual(stale.map((s) => [s.name, s.cause, s.broad]), [['old', 'helper', false]]);
});

test('staleFunctions prefers a narrow cause over a hub file', () => {
  const functions = [{ name: 'a', files: ['a', 'hub'] }, { name: 'b', files: ['b', 'hub'] }];
  const deployed = { a: '2026-10-30T18:00:00Z', b: '2026-10-30T18:00:00Z' };
  const stale = staleFunctions(functions, { a: '2026-11-01T00:00:00Z', hub: '2026-11-04T00:00:00Z' }, deployed, 2);
  assert.deepEqual(stale.map((s) => [s.name, s.cause, s.broad]), [['a', 'a', false], ['b', 'hub', true]]);
});

test('tocItems takes open rollout items of the released specs only', () => {
  const md = '### 1.1 A\n- 🚀 app release\n- 🔴 Excluded: nothing\n- ✅ test done\n### 1.2 B\n- 🚀 app release\n## 7. To test\n- 🔴 test';
  assert.deepEqual(tocItems(md, ['1.1']), [{ spec: '1.1', line: '🚀 app release' }]);
});

test('renderReport says when the functions could not be checked', () => {
  const report = renderReport({ version: '1.0.0', from: 'v0.9.0', commits: [], deployed: null, stale: [], hints: [], scripts: [], toc: [], sharedChanged: [] });
  assert.match(report, /Not checked/);
});
