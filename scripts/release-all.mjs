// All-apps release (`pnpm release all`): ONE version bump, the eight prod builds in parallel, one
// go/no-go, then the ship phase (Sentry, deploy, verify, app-version, git, native lanes).
//
// Everything that mutates the checkout (version bump, ngsw stamps) is undone by
// revertBuildPhase() on any failure, on Ctrl-C, and on a "No" at the go/no-go — a failed all-apps
// run must leave `git status` as it found it. After the go answer nothing is ever reverted: the
// version is built and gated for every app, so a failed site is repaired (`pnpm release <app>
// none`), not rolled back.
import { spawn } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import { stampNgswVersion } from './stamp-ngsw-version.mjs';
import {
  repoRoot, SITES, APPS, PROD_APP, run, ask, closePrompts, abort, bump, readVersion, writeVersion,
  preflight, runGates, verifyLive, commitSubmoduleStamp, commitPointers,
} from './release-shared.mjs';
import {
  runPool, missingSentryVars, appEnvKeys, firebaseAppId, bundleConfigProblem, nativeTargets, formatSummary,
  appVersionPatch,
} from './release-all.logic.mjs';

const KINDS = ['patch', 'minor', 'major'];
const mmss = (ms) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// Run state, set once by releaseAll. Module-level (not threaded through) so that `step` and `sh`
// stay plain two/three-argument helpers the ship phase can call the same way.
let ctx = null;

// ---- step timer ----------------------------------------------------------
// Runs fn, prints one line when it starts and one when it ends, and records { step, app, ms, ok }
// for formatSummary. `app` is '' for a step that runs once, alone (formatSummary adds those up).
// Rows that share a step name and carry an app count only their slowest, because formatSummary
// treats them as parallel — so steps that run side by side (build libs / build apps, the per-app
// work) are recorded as one step name with different `app` values, and steps that run one after
// another (the native lanes) get a step name of their own and an empty app.
// Rethrows, so callers decide.
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
// key any app .env defines (ctx.env). set-env.js REQUIRES FIREBASE_WEBAPP_CONFIG in the
// environment; `config:apps` gets it because Nx loads apps/<project>/.env into each task's env
// itself. Nx's dotenv load does not override a value that is already inherited, so a value
// leaking in from the caller's shell would win over the app's own and bake the WRONG Firebase app
// into a bundle — hence the scrub. `extraEnv` is added on top of that env for one call.
// Calling twice with one logName appends to the same log.
export function sh(app, command, logName, extraEnv = null) {
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
    const child = spawn('bash', ['-c', full], { cwd: repoRoot, env: extraEnv ? { ...ctx.env, ...extraEnv } : ctx.env, stdio: ['ignore', fd, fd] });
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

// Safety net for every exit path between the bump and the go/no-go answer. A TTY Ctrl-C at a
// prompt, a closed stdin or a drained event loop all end the process WITHOUT passing through the
// catch below, leaving package.json and the ngsw stamps modified — and, if nothing else sets it,
// exit code 0. Synchronous git is allowed in an 'exit' handler, and so is setting exitCode.
const onExit = () => {
  if (!ctx.armed || ctx.reverted) return;
  console.log('\nexiting before the go/no-go was answered');
  revertBuildPhase();
  process.exitCode = 1;
};

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

// ---- app-version doc -----------------------------------------------------
// The manual route, printed whenever the write cannot be done: the same Firestore doc and the
// same three ways to edit it that the single-app release prints today.
function printManualAppVersion(patch, why) {
  console.log(`\n  ⚠ ACTION REQUIRED — app-version/app-version was NOT written (${why}). Apply this manually:`);
  console.log('     Firestore doc  app-version/app-version  (default database):');
  for (const [k, v] of Object.entries(patch)) console.log(`        ${k}: ${JSON.stringify(v)}`);
  console.log('     via the Firebase console, the Firebase MCP firestore_update_document tool, or firebase-admin.');
  console.log('     Until you do this, deployed clients will NOT see the update prompt.');
}

/**
 * Writes `patch` (dotted field paths, see appVersionPatch) into app-version/app-version with
 * firebase-admin and application-default credentials (`gcloud auth application-default login`),
 * the way scripts/check-menu-labels.mjs does. Resolves true when written; resolves false — never
 * throws — after printing the manual instructions when there are no credentials or the write
 * fails. With `dryRun` it only prints the patch and resolves true.
 */
export async function writeAppVersion(patch, { dryRun = false } = {}) {
  if (!Object.keys(patch).length) {
    console.log('  app-version: nothing to write (no app verified).');
    return true;
  }
  if (dryRun) {
    console.log('    (dry run) would update app-version/app-version with:');
    for (const [k, v] of Object.entries(patch)) console.log(`        ${k}: ${JSON.stringify(v)}`);
    return true;
  }
  try {
    const { getApps, initializeApp } = await import('firebase-admin/app');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
    await getFirestore().doc('app-version/app-version').update(patch);
    console.log('  app-version/app-version updated:');
    for (const [k, v] of Object.entries(patch)) console.log(`        ${k}: ${JSON.stringify(v)}`);
    return true;
  } catch (e) {
    printManualAppVersion(patch, e?.message ?? String(e));
    return false;
  }
}

// ---- ship phase ----------------------------------------------------------
// One app, in order: Sentry source maps (before the deploy — they inject debug IDs into the
// built JS), hosting deploy, live-version check. Any failure fails THIS app only (a failed Sentry
// upload means it is not deployed, as in the single-app release when the upload command fails).
// The three steps keep one step name each across apps, so the summary counts their slowest.
async function shipApp(app) {
  const { opts, version } = ctx;
  const site = SITES[app];
  await step('sentry', app, () => sh(app, `node scripts/sentry-sourcemaps.mjs ${app}`, `sentry:${app}`));
  await step('deploy', app, () => sh(null, `firebase deploy --only hosting:${site}`, `deploy:${app}`));
  await step('verify', app, async () => {
    if (opts.dryRun) {
      console.log(`    (dry run) would verify https://${site}.web.app serves v${version}`);
      if (opts.failAt === `verify:${app}`) throw new Error(`verify of ${app} failed (simulated by --fail-at)`);
    } else {
      verifyLive(site, version);
    }
  });
}

// Release commit + tag, every app's submodule stamp and tag, ONE pointer commit, ONE push.
// The submodules push first (HEAD:main + tag), so the superproject pointer never names a commit
// the remote does not have. Mirrors releaseApp step 7 (same commit message, same annotated tag).
function gitPhase(version) {
  const { dryRun } = ctx.opts;
  const g = (args) => {
    if (dryRun) console.log(`    (dry run) would: git ${args.join(' ')}`);
    else run('git', args);
  };
  g(['add', 'package.json']);
  g(['commit', '-o', 'package.json', '-m', `release: v${version}`]);
  g(['tag', '-a', `v${version}`, '-m', `release v${version}`]);
  for (const app of APPS) {
    if (dryRun) console.log(`    (dry run) would: commitSubmoduleStamp(${app}, v${version}, push) — ngsw commit, tag, push HEAD:main + tag in apps/${app}`);
    else commitSubmoduleStamp(app, version, true);
  }
  if (dryRun) console.log(`    (dry run) would: commitPointers(${APPS.length} apps, v${version}, no push) — one pointer commit`);
  else commitPointers(APPS, version, false);
  g(['push', 'origin', 'main', '--follow-tags']);
}

// fastlane needs a UTF-8 locale or it dies on US-ASCII; web:reuse makes the lane take the web
// build in dist/apps/<app>/browser (production gate kept) instead of building again.
const FASTLANE_ENV = { LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' };
const fastlaneCommand = ({ app, platform }) =>
  platform === 'android' ? `fastlane android internal app:${app} web:reuse` : `fastlane ios beta app:${app} web:reuse`;

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
          env: process.env, logDir: '', version: '', appIds: {}, armed: false };

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
  process.once('exit', onExit);
  try {
    await step('bump', '', async () => {
      ctx.bumped = ctx.armed = true; // before the write: a half-done bump is reverted too
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
    //    while the other nx run is still writing would race it. Recorded as one step `build` with
    //    app `libs` / `apps` so the summary counts the slower of the two, not their sum.
    const gate = `pnpm nx run-many -t build --exclude='*-app,*-website,functions,okr' --skip-nx-cache --parallel=2`;
    const built = await Promise.allSettled([
      step('build', 'libs', () => sh(null, gate, 'build:libs')),
      step('build', 'apps', buildApps),
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
  // Ctrl-C at this prompt is a "No" (see ask()); the exit guard covers whatever else ends the run.
  let go = o.yes;
  if (!go) {
    const ans = (await ask(`Ship v${next} to ${APPS.length} apps (Sentry upload, hosting deploy, live check, commit/tag/push)? [y/N] `, { onInterrupt: 'n' })).toLowerCase();
    go = ans === 'y' || ans === 'yes';
  }
  process.removeListener('SIGINT', onSigint);
  if (!go) {
    revertBuildPhase();
    abort('Aborted at go/no-go — version bump and ngsw stamps reverted.');
  }
  process.removeListener('exit', onExit);
  ctx.armed = false;
  if (o.yes) closePrompts();

  // ================= ship phase: from here on nothing is reverted =================
  const { dryRun } = o;
  const tag = dryRun ? '  [dry run]' : '';
  console.log(`\n=== Shipping v${next}${tag} ===`);

  // 1. Sentry + deploy + verify per app. A failed app is recorded, never aborts the others.
  const shipped = await runPool(APPS, o.concurrency, shipApp);
  const verifiedApps = shipped.filter((r) => r.ok).map((r) => r.item);
  const failedApps = shipped.filter((r) => !r.ok).map((r) => ({ app: r.item, reason: r.error?.message ?? String(r.error) }));

  // 2. app-version: deployed.<app> only for verified apps, latestVersion only if the prod app
  //    verified; minVersion / forceUpdate only when given at the start. Never throws.
  const patch = appVersionPatch({
    version: next, verifiedApps, prodApp: PROD_APP,
    minVersion: o.minVersion ?? undefined, forceUpdate: o.forceUpdate === true,
  });
  console.log('\napp-version');
  let appVersionWritten = true;
  try {
    await step('app-version', '', async () => {
      if (!(await writeAppVersion(patch, { dryRun }))) throw new Error('not written — apply it by hand (instructions above)');
    });
  } catch { appVersionWritten = false; } // writeAppVersion itself never throws; step() has logged it

  // 3. git, even when sites failed: the version was built and gated for every app and the repair
  //    path redeploys exactly it.
  console.log('\ngit');
  let gitError = null;
  try { await step('git', '', async () => gitPhase(next)); }
  catch (e) { gitError = e; }

  // 4. native lanes, strictly one after the other (the Android and iOS lanes of one app share
  //    dist/apps/<app>), after the push, never for an app whose web ship failed. A failure is
  //    recorded and the next target still runs.
  const failedNative = [];
  if (o.native) {
    const failedSet = new Set(failedApps.map((f) => f.app));
    const targets = nativeTargets(APPS.filter((a) => !failedSet.has(a)), (p) => existsSync(join(repoRoot, p)));
    console.log(`\nnative lanes: ${targets.length ? targets.map((t) => `${t.app}/${t.platform}`).join(', ') : 'none (no android/ios platforms)'}`);
    for (const t of targets) {
      const name = `native:${t.app}-${t.platform}`;
      try { await step(name, '', () => sh(t.app, fastlaneCommand(t), name, FASTLANE_ENV)); }
      catch (e) { failedNative.push({ name, reason: e.message ?? String(e) }); }
    }
  }

  // 5. summary, on screen and (not in a dry run) in dist/release-logs/v<version>/summary.txt
  const summary = formatSummary(ctx.rows);
  console.log(`\n=== v${next} summary${tag} ===\n${summary}`);
  const summaryPath = join(ctx.logDir, 'summary.txt');
  if (dryRun) console.log(`\n(dry run) would write ${summaryPath.slice(repoRoot.length + 1)}`);
  else writeFileSync(summaryPath, `${summary}\n`);

  const problems = failedApps.length + failedNative.length + (gitError ? 1 : 0) + (appVersionWritten ? 0 : 1);
  if (failedApps.length) {
    console.log(`\n✖ ${failedApps.length} of ${APPS.length} sites are NOT on v${next}:`);
    for (const f of failedApps) console.log(`    ${f.app}: ${f.reason}\n      repair:  pnpm release ${f.app} none`);
  }
  if (gitError) console.log(`\n✖ git phase failed: ${gitError.message ?? gitError}\n    The release commit/tag/push may be incomplete — check \`git status\` and \`git log\`, then finish by hand.`);
  if (!appVersionWritten) console.log('\n✖ app-version was not written — see the instructions above.');
  for (const f of failedNative) console.log(`\n✖ ${f.name}: ${f.reason}`);
  if (problems) process.exitCode = 1;
  else console.log(`\n✔ v${next} released to ${APPS.length} sites${o.native ? ' and the native targets' : ''}.`);

  return { version: next, rows: ctx.rows, stamped: ctx.stamped, verifiedApps, failedApps, failedNative, ok: problems === 0 };
}
