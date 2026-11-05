import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bump, APPS } from './release-shared.mjs';
import { parseReleaseArgs, runPool, missingSentryVars, appEnvKeys, firebaseAppId, envValue, fillMissingEnv,
  bundleConfigProblem, appVersionPatch, nativeTargets, formatSummary, singleAppProblem } from './release-all.logic.mjs';

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
  // fastlane gate_production! rule: !0 AND no !1 anywhere
  assert.match(bundleConfigProblem('a={production:!0};b={production:!1,appId:"1:2:web:own"}', '1:2:web:own', []), /production:!1/);
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

test('formatSummary: total sums the app-less phase rows; per-app rows are shown but not summed', () => {
  const s = formatSummary([
    { step: 'gates', app: '', ms: 60000, ok: true },
    { step: 'build', app: 'libs', ms: 50000, ok: true },
    { step: 'build', app: 'apps', ms: 90000, ok: true },
    { step: 'build', app: '', ms: 95000, ok: true }, // wall-clock of the two parallel nx runs
    { step: 'ship', app: 'a-app', ms: 70000, ok: true },
    { step: 'ship', app: 'b-app', ms: 80000, ok: true },
    { step: 'ship', app: '', ms: 150000, ok: true }, // pool of 2 apps at concurrency 1: the real wall-clock
  ]);
  assert.match(s, /total\s+5:05/i); // 60 + 95 + 150 s, nothing from the per-app rows
  for (const needle of ['libs', 'apps', 'a-app', 'b-app']) assert.match(s, new RegExp(needle));
  assert.match(s, /per-app rows overlap/);
  assert.doesNotMatch(formatSummary([{ step: 'gates', app: '', ms: 1000, ok: true }]), /overlap/);
});

test('repair: apps may only redeploy the tagged current version', () => {
  assert.equal(singleAppProblem({ app: 'kwa-app', kind: 'none', tagExists: true }), null);
  assert.match(singleAppProblem({ app: 'kwa-app', kind: 'none', tagExists: false }), /tag/);
  assert.equal(singleAppProblem({ app: 'okr-website', kind: 'patch', tagExists: false }), null);
});

test('single app: a patch is allowed, minor and major go through all', () => {
  assert.equal(singleAppProblem({ app: 'kwa-app', kind: 'patch', tagExists: true }), null);
  assert.equal(singleAppProblem({ app: 'kwa-app', kind: 'patch', tagExists: false, matchesTag: false }), null);
  assert.match(singleAppProblem({ app: 'kwa-app', kind: 'minor', tagExists: true }), /all minor/);
  assert.match(singleAppProblem({ app: 'kwa-app', kind: 'major', tagExists: true }), /all major/);
});

test('single app: minVersion and forceUpdate are global, so a patch refuses them', () => {
  assert.match(singleAppProblem({ app: 'kwa-app', kind: 'patch', tagExists: true, minVersion: '7.57.1' }), /--min-version/);
  assert.match(singleAppProblem({ app: 'kwa-app', kind: 'patch', tagExists: true, forceUpdate: true }), /--force-update/);
});

test('repair: refuses when the code does not match the release tag', () => {
  assert.equal(singleAppProblem({ app: 'kwa-app', kind: 'none', tagExists: true, matchesTag: true }), null);
  const refusal = singleAppProblem({ app: 'kwa-app', kind: 'none', tagExists: true, matchesTag: false, tag: 'v7.57.0' });
  assert.match(refusal, /v7\.57\.0/);
  assert.match(refusal, /release through `all`/);
  assert.match(refusal, /Not on main/);
  assert.doesNotMatch(refusal, /git worktree add/);
  assert.equal(singleAppProblem({ app: 'okr-website', kind: 'patch', tagExists: false, matchesTag: false }), null);
});

test('envValue: plain, export, quoted, commented, multi-line, empty and absent', () => {
  assert.equal(envValue('SENTRY_ORG=acme\n', 'SENTRY_ORG'), 'acme');
  assert.equal(envValue('export SENTRY_ORG="acme"', 'SENTRY_ORG'), 'acme');
  assert.equal(envValue("SENTRY_ORG='a b'", 'SENTRY_ORG'), 'a b');
  assert.equal(envValue('SENTRY_ORG=acme # the org\nX=1', 'SENTRY_ORG'), 'acme');
  assert.equal(envValue('# SENTRY_ORG=nope\nSENTRY_PROJECT=p', 'SENTRY_ORG'), null);
  assert.equal(envValue('SENTRY_ORG=\n', 'SENTRY_ORG'), null);
  assert.equal(envValue('SENTRY_ORG=""', 'SENTRY_ORG'), null);
  assert.equal(envValue('', 'SENTRY_ORG'), null);
  const env = `FIREBASE_WEBAPP_CONFIG='{\n  "appId": "1:2:web:x"\n}'\nSENTRY_AUTH_TOKEN=tok\n`;
  assert.equal(envValue(env, 'SENTRY_AUTH_TOKEN'), 'tok');
  assert.equal(envValue(env, 'FIREBASE_WEBAPP_CONFIG'), '{\n  "appId": "1:2:web:x"\n}');
});

test('fillMissingEnv fills only missing keys and returns names, not values', () => {
  const text = 'SENTRY_AUTH_TOKEN=fromfile\nSENTRY_ORG=fileorg\nSENTRY_PROJECT=\n';
  const env = { SENTRY_ORG: 'already' };
  const filled = fillMissingEnv(text, ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'], env);
  assert.deepEqual(filled, ['SENTRY_AUTH_TOKEN']);
  assert.deepEqual(env, { SENTRY_ORG: 'already', SENTRY_AUTH_TOKEN: 'fromfile' });
});
