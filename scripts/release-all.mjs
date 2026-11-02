// All-apps release (`pnpm release all`): ONE version bump, the eight prod builds in parallel, one
// go/no-go. This file holds the BUILD phase (preflight .. go/no-go); the ship phase (Sentry,
// deploy, verify, app-version, git, native) is appended after the go/no-go by the next task and
// reuses `step` and `sh` below.
//
// Everything that mutates the checkout (version bump, ngsw stamps) is undone by
// revertBuildPhase() on any failure, on Ctrl-C, and on a "No" at the go/no-go — a failed all-apps
// run must leave `git status` as it found it.
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import { stampNgswVersion } from './stamp-ngsw-version.mjs';
import {
  repoRoot, SITES, APPS, run, ask, confirm, closePrompts, abort, bump, readVersion, writeVersion,
  preflight, runGates,
} from './release-shared.mjs';
import {
  runPool, missingSentryVars, appEnvKeys, firebaseAppId, bundleConfigProblem, nativeTargets, formatSummary,
} from './release-all.logic.mjs';

const KINDS = ['patch', 'minor', 'major'];
const mmss = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// Run state, set once by releaseAll. Module-level (not threaded through) so that `step` and `sh`
// stay plain two/three-argument helpers the ship phase can call the same way.
let ctx = null;

// ---- step timer ----------------------------------------------------------
// Runs fn, prints one line when it starts and one when it ends, and records { step, app, ms, ok }
// for formatSummary. `app` is '' for a step that runs once (formatSummary adds those up; rows of
// one step across apps run in parallel and count only their slowest). Rethrows, so callers decide.
export async function step(name, app, fn) {
  const label = app ? `${name} ${app}` : name;
  const t0 = Date.now();
  console.log(`  ▸ ${label}`);
  try {
    const out = await fn();
    const ms = Date.now() - t0;
    ctx.rows.push({ step: name, app: app ?? '', ms, ok: true });
    console.log(`  ✔ ${label}  ${mmss(ms)}`);
    return out;
  } catch (e) {
    const ms = Date.now() - t0;
    ctx.rows.push({ step: name, app: app ?? '', ms, ok: false });
    console.log(`  ✖ ${label}  ${mmss(ms)}  ${e.message ?? e}`);
    throw e;
  }
}

// ---- shell with a log file -----------------------------------------------
const logPathOf = (logName) => join(ctx.logDir, `${logName.replaceAll(':', '-')}.log`);
const opened = new Set();

// Runs `bash -c <command>` with all output in dist/release-logs/v<version>/<logName>.log — never on
// the terminal, because eight concurrent builds would interleave into noise. With `app`, the
// command first sources that app's .env INSIDE the child. The child env is process.env minus every
// key any app .env defines (ctx.env): set-env.js prefers FIREBASE_WEBAPP_CONFIG from the
// environment over apps/<app>/.env, so a value leaking in from the caller's shell (or a previous
// app) would bake the WRONG Firebase app into a bundle.
// Calling twice with one logName appends to the same log.
export function sh(app, command, logName) {
  const full = app ? `set -a; source ./apps/${app}/.env; set +a; ${command}` : command;
  const { opts } = ctx;
  if (opts.dryRun) {
    console.log(`    $ ${app ? `[apps/${app}/.env] ` : ''}${command}`);
    return opts.failAt === logName
      ? Promise.reject(new Error(`${logName} failed (simulated by --fail-at)`))
      : Promise.resolve();
  }
  const logPath = logPathOf(logName);
  const fd = openSync(logPath, opened.has(logPath) ? 'a' : 'w');
  opened.add(logPath);
  writeSync(fd, `$ ${full.replace(/\s+/g, ' ')}\n`);
  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-c', full], { cwd: repoRoot, env: ctx.env, stdio: ['ignore', fd, fd] });
    closeSync(fd); // the child holds its own copy
    ctx.children.add(child);
    const rel = logPath.slice(repoRoot.length + 1);
    child.on('error', (e) => { ctx.children.delete(child); reject(new Error(`${logName}: ${e.message} — see ${rel}`)); });
    child.on('close', (code, signal) => {
      ctx.children.delete(child);
      if (code === 0) resolve();
      else reject(new Error(`${logName} failed (${signal ?? `exit ${code}`}) — see ${rel}`));
    });
  });
}

// ---- revert --------------------------------------------------------------
// Undoes the version bump and the ngsw stamps. Idempotent (error path + SIGINT + "No" may all
// reach it) and synchronous (it also runs inside a signal handler). Logs even in a dry run so the
// failure path can be exercised without writing anything.
function revertBuildPhase() {
  if (ctx.reverted || !ctx.bumped) return;
  ctx.reverted = true;
  console.log('\nreverting version bump and ngsw stamps');
  if (ctx.opts.dryRun) {
    console.log('  (dry run) would: git checkout -- package.json');
    for (const app of ctx.stamped) console.log(`  (dry run) would: git -C apps/${app} checkout -- ngsw-config.json`);
    return;
  }
  const attempt = (args) => {
    try { run('git', args); } catch (e) { console.error(`  ⚠ ${['git', ...args].join(' ')} failed: ${e.message}`); }
  };
  attempt(['checkout', '--', 'package.json']);
  for (const app of ctx.stamped) attempt(['-C', `apps/${app}`, 'checkout', '--', 'ngsw-config.json']);
}

const onSigint = () => {
  for (const child of ctx.children) child.kill('SIGTERM');
  revertBuildPhase();
  abort('Interrupted — build phase reverted.');
};

// ---- build helpers -------------------------------------------------------
// The newest main-*.js, the same pick fastlane makes (by mtime); null when the build left none.
function newestMain(app) {
  const dir = join(repoRoot, `dist/apps/${app}/browser`);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => /^main-.*\.js$/.test(f)).map((f) => join(dir, f));
  return files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

// config (writes each app's environment.ts from its own .env) then build, for all apps in two nx
// runs. --exclude-task-dependencies: the build target would otherwise re-run `config` per app.
async function buildApps() {
  const { opts } = ctx;
  const projects = APPS.join(',');
  for (const app of APPS) {
    if (opts.dryRun) console.log(`    $ rm -rf dist/apps/${app}`);
    else rmSync(join(repoRoot, `dist/apps/${app}`), { recursive: true, force: true });
  }
  try {
    await sh(null, `pnpm nx run-many -t config -c production --projects=${projects} --skip-nx-cache`, 'config:apps');
    await sh(null, `pnpm nx run-many -t build -c production --projects=${projects} --exclude-task-dependencies --skip-nx-cache --parallel=${opts.concurrency}`, 'build:apps');
    // A dry run has no real build to fail: `--fail-at=build:<app>` stands in for one app's failure.
    const simulated = opts.dryRun && /^build:(.+)$/.exec(opts.failAt ?? '')?.[1];
    if (simulated && APPS.includes(simulated)) throw new Error(`build of ${simulated} failed (simulated by --fail-at)`);
  } catch (e) {
    // nx reports one aggregate failure; the apps without a main-*.js are the ones that broke.
    const broken = opts.dryRun ? [] : APPS.filter((app) => !newestMain(app));
    throw new Error(`app build failed${broken.length ? ` for ${broken.join(', ')}` : ''}: ${e.message}`);
  }
}

// Everything that has to hold for ONE built app before it may ship (brief step 7).
async function postBuild(app) {
  const { opts, appIds } = ctx;
  if (opts.dryRun) {
    console.log(`    (dry run) would check dist/apps/${app}/browser/main-*.js: production build, ${app}'s own appId, no other app's`);
  } else {
    const main = newestMain(app);
    if (!main) throw new Error(`no dist/apps/${app}/browser/main-*.js — the build left nothing`);
    const others = APPS.filter((a) => a !== app).map((a) => appIds[a]);
    const problem = bundleConfigProblem(readFileSync(main, 'utf8'), appIds[app], others);
    if (problem) throw new Error(`${app}: ${problem}`);
  }
  const log = `postbuild:${app}`;
  // Bundle budget: the dashboard's static JS closure may not grow >5 % over perf-budget.json.
  try { await sh(app, `node scripts/perf-budget.mjs ${app}`, log); }
  catch (e) { throw new Error(`Bundle budget exceeded for ${app} (${e.message}). Run  node scripts/bundle-closure.mjs dist/apps/${app}/browser <lib>  to find the new static edge, or  node scripts/perf-budget.mjs ${app} --write  if the growth is intended.`); }
  // OSS attribution assembles the 3rdpartylicenses.txt the build just emitted — after the build.
  await sh(app, `node scripts/gen-attribution.mjs ${app}`, log);
  // Service-worker stamp: makes ngsw-worker.js differ per release so installed apps pick up the
  // current CSP headers. Before the Sentry step, which re-hashes after it.
  await sh(app, `node scripts/stamp-ngsw-worker.mjs ${app}`, log);
}

function readEnvs() {
  const missing = APPS.filter((a) => !existsSync(join(repoRoot, `apps/${a}/.env`)));
  if (missing.length) abort(`Missing .env for ${missing.join(', ')} — required to source FIREBASE_WEBAPP_CONFIG for the prod builds.`);
  return Object.fromEntries(APPS.map((a) => [a, readFileSync(join(repoRoot, `apps/${a}/.env`), 'utf8')]));
}

// ---- entry ---------------------------------------------------------------
/**
 * @param opts the object parseReleaseArgs returns. Under opts.dryRun nothing is written or run:
 *   commands are logged, writeVersion / stampNgswVersion / runGates only log. opts.failAt names a
 *   step log (`build:<app>`, `postbuild:<app>`, `build:libs`, …) to fail on.
 * @returns { version, rows, stamped } after a "go"; the ship phase continues from there.
 */
export async function releaseAll(opts) {
  const o = { concurrency: 3, ...opts };
  if (o.target !== 'all') abort(`releaseAll only releases target 'all' (got '${o.target}').`);
  if (o.kind === 'none') abort("'none' is for single-app repair — it cannot release all apps.");
  if (o.kind && !KINDS.includes(o.kind)) abort(`Unknown bump '${o.kind}' — expected patch, minor or major.`);

  ctx = { opts: o, rows: [], children: new Set(), stamped: [], bumped: false, reverted: false,
          env: process.env, logDir: '', version: '', appIds: {} };

  // 1. preflight, and the bump kind
  await step('preflight', '', async () => {
    await preflight();
    if (!o.kind) {
      if (o.yes) abort('No bump kind given — pass patch, minor or major (required with --yes).');
      const ans = (await ask(`\nBump version from ${readVersion()} — patch/minor/major? [patch] `)).toLowerCase() || 'patch';
      if (ans === 'none') abort("'none' is for single-app repair — it cannot release all apps.");
      if (!KINDS.includes(ans)) abort(`Unknown bump '${ans}' — expected patch, minor or major.`);
      o.kind = ans;
    }
  });
  // Nothing past this point prompts under --yes; leave no readline open so the process can exit.
  if (o.yes) closePrompts();

  // 2. Sentry pre-check: the ship phase uploads source maps for every app, so an app that cannot
  //    would otherwise fail only after eight builds. Also where the env is scrubbed (see sh()).
  await step('sentry-precheck', '', async () => {
    const envs = readEnvs();
    const bad = APPS.map((a) => [a, missingSentryVars(envs[a])]).filter(([, m]) => m.length);
    if (bad.length) abort(`Missing Sentry variables — ${bad.map(([a, m]) => `${a}: ${m.join(', ')}`).join('; ')}. Add them to apps/<app>/.env.`);
    ctx.appIds = Object.fromEntries(APPS.map((a) => [a, firebaseAppId(envs[a])]));
    const scrub = appEnvKeys(Object.values(envs));
    ctx.env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !scrub.has(k)));
  });

  // 3. every pre-bump gate (tests, forms, popovers, i18n, menu labels, catalogue drift)
  await step('gates', '', async () => {
    if (o.dryRun) console.log('    (dry run) would run runGates({ nonInteractive: opts.yes, acceptDrift, acceptMenuLabels })');
    else await runGates({ nonInteractive: o.yes, acceptDrift: o.acceptDrift, acceptMenuLabels: o.acceptMenuLabels });
  });

  // 4. ONE bump for all apps, then the ngsw stamps. From here until the go/no-go, a failure or
  //    Ctrl-C must undo both: package.json plus every stamped ngsw-config.json (app submodules).
  const current = readVersion();
  const next = bump(current, o.kind);
  ctx.version = next;
  ctx.logDir = join(repoRoot, 'dist/release-logs', `v${next}`);
  if (!o.dryRun) mkdirSync(ctx.logDir, { recursive: true });
  console.log(`\nVersion ${current} -> ${next} (${o.kind}) for ${APPS.length} apps${o.dryRun ? '  [dry run]' : ''}`);
  process.once('SIGINT', onSigint);
  try {
    await step('bump', '', async () => {
      ctx.bumped = true; // before the write: a half-done bump is reverted too
      if (o.dryRun) console.log(`    (dry run) would write package.json ${current} -> ${next}`);
      else writeVersion(current, next);
      for (const app of APPS) {
        if (o.dryRun) { console.log(`    (dry run) would stamp apps/${app}/ngsw-config.json`); ctx.stamped.push(app); }
        else if (stampNgswVersion(app, next)) ctx.stamped.push(app);
      }
    });

    // 5. logo assets — before the build, so the rewritten manifest/icons are bundled. Non-fatal,
    //    as in the single-app release: the committed icons are still valid.
    await runPool(APPS, o.concurrency, (app) => step('logo', app, async () => {
      try { await sh(app, `node scripts/gen-logo-assets.mjs ${app}`, `logo:${app}`); }
      catch (e) { console.log(`    ⚠ Logo generation failed for ${app} — continuing with the committed icons. ${e.message}`); }
    }));

    // 6. lib gate and app builds side by side; both must succeed. allSettled, not all: reverting
    //    while the other nx run is still writing would race it.
    const gate = `pnpm nx run-many -t build --exclude='*-app,*-website,functions,okr' --skip-nx-cache --parallel=2`;
    const built = await Promise.allSettled([
      step('build:libs', '', () => sh(null, gate, 'build:libs')),
      step('build:apps', '', buildApps),
    ]);
    const failed = built.filter((r) => r.status === 'rejected');
    if (failed.length) throw new Error(failed.map((r) => r.reason.message).join('\n'));

    // 7. per-app checks and stamps on the fresh bundles
    const post = await runPool(APPS, o.concurrency, (app) => step('postbuild', app, () => postBuild(app)));
    const bad = post.filter((r) => !r.ok);
    if (bad.length) throw new Error(bad.map((r) => `${r.item}: ${r.error.message}`).join('\n'));
  } catch (e) {
    revertBuildPhase();
    abort(`Build phase failed — ${e.message ?? e}`);
  }

  // 8. the single go/no-go: everything is built and checked; the next step goes outward.
  const native = o.native ? nativeTargets(APPS, (p) => existsSync(join(repoRoot, p))) : [];
  console.log(`\n=== v${next} is built (${APPS.length} apps) ===`);
  for (const app of APPS) console.log(`  ${app.padEnd(12)} -> ${SITES[app]}`);
  if (o.native) console.log(`  native: ${native.length ? native.map((t) => `${t.app}/${t.platform}`).join(', ') : 'no android/ios platforms found'}`);
  console.log(`\n${formatSummary(ctx.rows)}\n`);
  const go = o.yes || await confirm(`Ship v${next} to ${APPS.length} apps (Sentry upload, hosting deploy, live check, commit/tag/push)?`, false);
  process.removeListener('SIGINT', onSigint);
  if (!go) {
    revertBuildPhase();
    abort('Aborted at go/no-go — version bump and ngsw stamps reverted.');
  }
  if (o.yes) closePrompts();

  // ship phase: Task 4 (Sentry, deploy, verify, app-version, git, native) continues here.
  return { version: next, rows: ctx.rows, stamped: ctx.stamped };
}
