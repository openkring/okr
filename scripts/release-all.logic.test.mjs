import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bump, APPS } from './release-shared.mjs';
import { parseReleaseArgs, runPool, missingSentryVars, appEnvKeys, firebaseAppId,
  bundleConfigProblem, appVersionPatch, nativeTargets, formatSummary } from './release-all.logic.mjs';

test('bump keeps today\'s semantics', () => {
  assert.equal(bump('7.56.2', 'patch'), '7.56.3');
  assert.equal(bump('7.56.2', 'minor'), '7.57.0');
  assert.equal(bump('7.56.2', 'major'), '8.0.0');
});

test('APPS is exactly the eight tenant apps', () => {
  assert.deepEqual([...APPS].sort(), ['bka-app', 'bkg-app', 'elab-app', 'kring-app', 'kwa-app', 'okr-app', 'p13-app', 'scs-app']);
});

test('parseReleaseArgs: all with flags', () => {
  const a = parseReleaseArgs(['all', 'minor', '--native', '--yes', '--accept-drift', '--concurrency=4']);
  assert.deepEqual([a.target, a.kind, a.native, a.yes, a.acceptDrift, a.acceptMenuLabels, a.concurrency],
    ['all', 'minor', true, true, true, false, 4]);
  assert.equal(parseReleaseArgs(['all']).concurrency, 3);
  assert.throws(() => parseReleaseArgs(['all', '--nope']));
});

test('parseReleaseArgs: defaults, fail-at, min-version, rejections', () => {
  const d = parseReleaseArgs(['all']);
  assert.deepEqual(d, { target: 'all', kind: null, native: false, yes: false, acceptDrift: false,
    acceptMenuLabels: false, dryRun: false, failAt: null, concurrency: 3, minVersion: null, forceUpdate: false });
  const a = parseReleaseArgs(['all', 'patch', '--dry-run', '--accept-menu-labels', '--fail-at=build:kwa-app',
    '--min-version=7.57.0', '--force-update']);
  assert.deepEqual([a.dryRun, a.acceptMenuLabels, a.failAt, a.minVersion, a.forceUpdate],
    [true, true, 'build:kwa-app', '7.57.0', true]);
  assert.equal(parseReleaseArgs([]).target, null);
  assert.throws(() => parseReleaseArgs(['all', '--concurrency=0']));
  assert.throws(() => parseReleaseArgs(['all', '--concurrency=x']));
  assert.throws(() => parseReleaseArgs(['all', '--concurrency=2.5']));
  assert.throws(() => parseReleaseArgs(['all', '--min-version=7.57']));
  assert.throws(() => parseReleaseArgs(['all', 'minor', 'extra']));
});

test('runPool: limit respected, order kept, failures captured', async () => {
  let live = 0, peak = 0;
  const res = await runPool([1, 2, 3, 4, 5], 2, async (n) => {
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 5));
    live--;
    if (n === 3) throw new Error('boom');
  });
  assert.equal(peak, 2);
  assert.deepEqual(res.map((r) => [r.item, r.ok]), [[1, true], [2, true], [3, false], [4, true], [5, true]]);
  assert.equal(res[2].error.message, 'boom');
  assert.equal(typeof res[0].ms, 'number');
  assert.equal(res[0].error, null);
});

test('runPool: empty input and a synchronous throw', async () => {
  assert.deepEqual(await runPool([], 3, async () => {}), []);
  const res = await runPool(['a'], 3, () => { throw new Error('sync'); });
  assert.equal(res[0].ok, false);
  assert.equal(res[0].error.message, 'sync');
});

test('missingSentryVars', () => {
  assert.deepEqual(missingSentryVars('SENTRY_AUTH_TOKEN=x\nSENTRY_ORG=o\nSENTRY_PROJECT=\n'), ['SENTRY_PROJECT']);
  assert.deepEqual(missingSentryVars(''), ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']);
  assert.deepEqual(missingSentryVars('export SENTRY_AUTH_TOKEN=x\nSENTRY_ORG="o"\nSENTRY_PROJECT=p'), []);
});

test('appEnvKeys collects keys from all app .env files', () => {
  const keys = appEnvKeys(['# c\nFIREBASE_WEBAPP_CONFIG={}\n\nexport SENTRY_ORG=o', 'KWA_ONLY=1']);
  assert.deepEqual([...keys].sort(), ['FIREBASE_WEBAPP_CONFIG', 'KWA_ONLY', 'SENTRY_ORG']);
});

test('firebaseAppId reads appId from FIREBASE_WEBAPP_CONFIG', () => {
  assert.equal(firebaseAppId(`FIREBASE_WEBAPP_CONFIG='{"apiKey":"k","appId":"1:2:web:abc"}'`), '1:2:web:abc');
  assert.equal(firebaseAppId('SENTRY_ORG=o'), null);
});

test('firebaseAppId: real .env style, multi-line single-quoted JSON', () => {
  const env = [
    'SENTRY_ORG=o',
    "FIREBASE_WEBAPP_CONFIG='{",
    '  "apiKey": "fake-key",',
    '  "appId": "1:123:web:fakeid",',
    '  "projectId": "fake-project"',
    "}'",
    '',
    'NEXT_PUBLIC_X=1',
  ].join('\n');
  assert.equal(firebaseAppId(env), '1:123:web:fakeid');
  assert.deepEqual([...appEnvKeys([env])].sort(), ['FIREBASE_WEBAPP_CONFIG', 'NEXT_PUBLIC_X', 'SENTRY_ORG']);
});

test('bundleConfigProblem', () => {
  const ok = 'x={production:!0,appId:"1:2:web:own"}';
  assert.equal(bundleConfigProblem(ok, '1:2:web:own', ['1:2:web:other']), null);
  assert.match(bundleConfigProblem('x={production:!1,appId:"1:2:web:own"}', '1:2:web:own', []), /development/);
  assert.match(bundleConfigProblem(ok.replace('own', 'other'), '1:2:web:own', ['1:2:web:other']), /other/);
  assert.match(bundleConfigProblem('x={production:!0}', '1:2:web:own', []), /own/);
  assert.ok(bundleConfigProblem(ok, '', []));
  assert.ok(bundleConfigProblem(ok, null, []));
});

test('appVersionPatch: all verified', () => {
  assert.deepEqual(appVersionPatch({ version: '7.57.0', verifiedApps: ['scs-app', 'kwa-app'], prodApp: 'scs-app' }),
    { 'deployed.scs': '7.57.0', 'deployed.kwa': '7.57.0', latestVersion: '7.57.0' });
});

test('appVersionPatch: prod app failed -> no latestVersion; minVersion/forceUpdate only when given', () => {
  assert.deepEqual(appVersionPatch({ version: '7.57.0', verifiedApps: ['kwa-app'], prodApp: 'scs-app' }),
    { 'deployed.kwa': '7.57.0' });
  assert.deepEqual(appVersionPatch({ version: '7.57.0', verifiedApps: ['scs-app'], prodApp: 'scs-app', minVersion: '7.57.0', forceUpdate: true }),
    { 'deployed.scs': '7.57.0', latestVersion: '7.57.0', minVersion: '7.57.0', forceUpdate: true });
  assert.deepEqual(appVersionPatch({ version: '1.0.0', verifiedApps: ['scs-app'], prodApp: 'scs-app', forceUpdate: false }),
    { 'deployed.scs': '1.0.0', latestVersion: '1.0.0' });
});

test('nativeTargets', () => {
  const have = new Set(['apps/scs-app/android', 'apps/scs-app/ios', 'apps/bka-app/ios']);
  assert.deepEqual(nativeTargets(['scs-app', 'kwa-app', 'bka-app'], (p) => have.has(p)),
    [{ app: 'scs-app', platform: 'android' }, { app: 'scs-app', platform: 'ios' }, { app: 'bka-app', platform: 'ios' }]);
});

test('formatSummary lists every row and a total', () => {
  const s = formatSummary([{ step: 'gates', app: '', ms: 61000, ok: true }, { step: 'deploy', app: 'kwa-app', ms: 2000, ok: false }]);
  assert.match(s, /gates/); assert.match(s, /kwa-app/); assert.match(s, /FAIL/); assert.match(s, /total/i);
});

test('formatSummary: total is wall-clock (sequential rows add, parallel app rows overlap)', () => {
  const s = formatSummary([
    { step: 'gates', app: '', ms: 60000, ok: true },
    { step: 'build', app: 'a-app', ms: 30000, ok: true },
    { step: 'build', app: 'b-app', ms: 40000, ok: true },
  ]);
  assert.match(s, /total\s+1:40/i);
  assert.match(s, /ok/);
});
