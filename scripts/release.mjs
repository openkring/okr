#!/usr/bin/env node
// Guided release runbook: version bump + prod build + test gate + Firebase deploy + tag/push.
// Usage:
//   node scripts/release.mjs                 # interactive target picker
//   node scripts/release.mjs scs-app         # release one app (or: all)
//   node scripts/release.mjs functions       # deploy Cloud Functions (all, or prompted subset)
//   node scripts/release.mjs rules           # deploy firestore + storage rules
// Deterministic spine; confirmations are interactive. The app-version Firestore doc is NOT
// written here — the script prints the exact value to apply (console / MCP / firebase-admin).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = join(repoRoot, 'package.json');

// app -> hosting site id (from firebase.json). Keep in sync with the firebase-deploy skill.
const SITES = {
  'scs-app': 'scs-app-54aef',
  'okr-website': 'okr-website-54aef',
  'kring-website': 'kring-website-54aef',
  'p13-website': 'p13-website-54aef',
};
const PROD_APP = 'scs-app'; // only this app's users see the in-app update prompt

// Silence the DEP0040 "punycode is deprecated" warning emitted by firebase-tools (a transitive
// dep using Node's built-in punycode). Scoped to this run's child processes; preserves any
// existing NODE_OPTIONS. Node >= 21.3 supports --disable-warning.
process.env.NODE_OPTIONS = ['--disable-warning=DEP0040', process.env.NODE_OPTIONS].filter(Boolean).join(' ');

// ---- small helpers -------------------------------------------------------
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
const capture = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8', ...opts }).trim();

function ask(q) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => { rl.close(); res(a.trim()); }));
}
async function confirm(q, def = true) {
  const a = (await ask(`${q} ${def ? '[Y/n]' : '[y/N]'} `)).toLowerCase();
  if (!a) return def;
  return a === 'y' || a === 'yes';
}
function abort(msg) { console.error(`\n✖ ${msg}`); process.exit(1); }
function bump(v, kind) {
  const [maj, min, pat] = v.split('.').map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}
const readVersion = () => JSON.parse(readFileSync(pkgPath, 'utf8')).version;

// ---- preflight (all branches) -------------------------------------------
async function preflight() {
  const branch = capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch !== 'main' && !(await confirm(`Not on main (on '${branch}'). Continue?`, false)))
    abort('Aborted: not on main.');
  const dirty = capture('git', ['status', '--porcelain']).split('\n').filter(Boolean);
  if (dirty.length) {
    console.log('Working tree has uncommitted changes:\n' + dirty.join('\n'));
    if (!(await confirm('Continue anyway?', false))) abort('Aborted: dirty working tree.');
  }
}

// ---- app release ---------------------------------------------------------
async function releaseApp(app) {
  const site = SITES[app];
  if (!site) abort(`Unknown app '${app}'. Known: ${Object.keys(SITES).join(', ')}`);
  if (!existsSync(join(repoRoot, `apps/${app}/.env`)))
    abort(`Missing apps/${app}/.env — required to source FIREBASE_WEBAPP_CONFIG for the prod build.`);

  console.log(`\n=== Releasing ${app} (site ${site}) ===`);

  // 1. test gate FIRST (cheap, fail-fast)
  console.log('\n[1/6] Running full test suite (pnpm run testlibs)…');
  try { run('pnpm', ['run', 'testlibs']); }
  catch { abort('Tests failed — release aborted (no version bump made).'); }

  // 2. version bump (confirm) — bump BEFORE build so the nx config cache busts
  const current = readVersion();
  const kindAns = (await ask(`\n[2/6] Bump version from ${current} — patch/minor/major? [patch] `)).toLowerCase() || 'patch';
  const kind = ['patch', 'minor', 'major'].includes(kindAns) ? kindAns : 'patch';
  const next = bump(current, kind);
  if (!(await confirm(`Set version ${current} -> ${next}?`, true))) abort('Aborted at version bump.');
  writeFileSync(pkgPath, readFileSync(pkgPath, 'utf8').replace(`"version": "${current}"`, `"version": "${next}"`));
  console.log(`package.json version -> ${next}`);

  try {
    // 3. prod build (source .env so FIREBASE_WEBAPP_CONFIG is set for the prod config target)
    console.log(`\n[3/7] Building ${app} (production)…`);
    run('bash', ['-c', `set -a; source ./apps/${app}/.env; set +a; pnpm nx build ${app} --configuration production`]);

    // 4. Sentry source maps — MUST run before deploy (injects debug IDs into the built JS,
    //    uploads maps, finalizes the scs@<version> release). Skipped if SENTRY_* not exported.
    console.log('\n[4/7] Sentry source maps');
    const hasSentry = ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT'].every((v) => process.env[v]);
    if (hasSentry) {
      run('node', ['scripts/sentry-sourcemaps.mjs', app]);
    } else {
      console.log('  ⚠ SENTRY_AUTH_TOKEN/SENTRY_ORG/SENTRY_PROJECT not set — source maps NOT uploaded.');
      console.log('    Stack traces for this release will be unminified in Sentry.');
      if (app === PROD_APP && !(await confirm('  Deploy the production app without source maps?', false)))
        abort('Aborted: export the SENTRY_* deploy vars, then re-run.');
    }

    // 5. deploy hosting (confirm — outward-facing)
    if (!(await confirm(`\n[5/7] Deploy ${app} to hosting:${site}?`, true))) abort('Aborted before deploy.');
    run('firebase', ['deploy', '--only', `hosting:${site}`]);
  } catch (e) {
    run('git', ['checkout', '--', 'package.json']);
    abort(`Build/deploy failed — reverted version bump. ${e.message ?? ''}`);
  }

  // 6. app-version doc — ask each release (default yes only for the prod app)
  console.log('\n[6/7] app-version update');
  if (await confirm(`Update app-version.latestVersion to ${next}? (triggers the in-app update prompt)`, app === PROD_APP)) {
    const minAns = await ask('  minVersion — leave blank to keep unchanged, or enter a value to force-update older clients: ');
    console.log('\n  → Apply this to Firestore doc  app-version/app-version  (default database):');
    console.log(`        latestVersion: "${next}"`);
    console.log(`        minVersion:    ${minAns ? `"${minAns}"  (CHANGED — forces update below this)` : '(keep current)'}`);
    console.log('     via the Firebase console, the Firebase MCP firestore_update_document tool, or firebase-admin.');
  } else {
    console.log('  Skipped app-version update.');
  }

  // 7. commit + tag + push (confirm push — outward-facing)
  console.log('\n[7/7] Commit + tag');
  run('git', ['add', 'package.json']);
  run('git', ['commit', '-m', `release: v${next}`]);
  run('git', ['tag', '-a', `v${next}`, '-m', `release v${next}`]);
  if (await confirm(`Push commit + tag v${next} to origin/main?`, true))
    run('git', ['push', 'origin', 'main', '--follow-tags']);
  else
    console.log(`  Not pushed. Push later with:  git push origin main --follow-tags`);

  console.log(`\n✔ ${app} released as v${next}.`);
}

// ---- functions -----------------------------------------------------------
// Delegates to scripts/deploy-functions.mjs (build + pin + prune + pnpm-pin canary).
async function releaseFunctions() {
  console.log('\n=== Deploy Cloud Functions ===  (no version bump, no tag)');
  const names = (await ask('Function names (space/comma-separated), or blank for ALL: ')).trim();
  if (!(await confirm(`Deploy ${names || 'ALL functions'}?`, true))) abort('Aborted.');
  run('node', ['scripts/deploy-functions.mjs', ...(names ? names.split(/[\s,]+/) : [])]);
  console.log('\n✔ Functions deployed. Commit any pending source changes separately.');
}

// ---- rules ---------------------------------------------------------------
async function releaseRules() {
  console.log('\n=== Deploy security rules ===  (no version bump, no tag)');
  if (await confirm('Deploy firestore:rules?', true)) run('firebase', ['deploy', '--only', 'firestore:rules']);
  if (await confirm('Deploy storage rules?', true)) run('firebase', ['deploy', '--only', 'storage']);
  console.log('\n✔ Rules deployed. Commit any pending rules-file changes separately.');
}

// ---- entry ---------------------------------------------------------------
async function main() {
  await preflight();
  let target = process.argv[2];
  if (!target) {
    console.log('\nRelease target:');
    Object.keys(SITES).forEach((a) => console.log(`  ${a}`));
    console.log('  all        (every app)\n  functions  (Cloud Functions)\n  rules      (firestore + storage rules)');
    target = await ask('\nChoose target: ');
  }

  if (target === 'all') { for (const a of Object.keys(SITES)) await releaseApp(a); }
  else if (target === 'functions') await releaseFunctions();
  else if (target === 'rules') await releaseRules();
  else if (SITES[target]) await releaseApp(target);
  else abort(`Unknown target '${target}'.`);
}

main().catch((e) => abort(e.message ?? String(e)));
