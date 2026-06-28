#!/usr/bin/env node
// Deploy Cloud Functions through the Cloud Build buildpack, with a pnpm-pin safety canary.
//
// The buildpack installs prod deps with the pnpm version pinned in the deployed
// package.json. A pin the buildpack can't activate (corepack signature mismatch) or that
// can't read the lockfile fails the build for ALL functions. So when the pin changes vs the
// last-verified value, we deploy ONE trivial function first (a canary) — its Cloud Build
// exercises the exact buildpack+pnpm path with minimal blast radius. Only on success do we
// record the new verified pin and deploy the rest.
//
// Usage:
//   node scripts/deploy-functions.mjs                 # deploy ALL functions
//   node scripts/deploy-functions.mjs fnA fnB         # deploy only these (still canary-gated)
// Env:
//   FUNCTIONS_PNPM=10.33.2    # force a buildpack pin instead of root packageManager
//   FUNCTIONS_CANARY=getEcho  # override the canary function (default: getEcho)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(repoRoot, 'dist/apps/functions');
const verifiedPath = join(repoRoot, 'scripts/functions-pnpm-verified.json');

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', cwd: repoRoot, ...opts });
const abort = (msg) => { console.error(`\n✖ ${msg}`); process.exit(1); };
function tryCapture(cmd, args) {
  try { return execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8' }).trim(); }
  catch { return '?'; }
}

// Buildpack pin: FUNCTIONS_PNPM override, else the pnpm version from root packageManager.
// `source` matters for recovery: 'packageManager' also drives local pnpm via corepack.
function resolvePin() {
  if (process.env.FUNCTIONS_PNPM) return { pin: process.env.FUNCTIONS_PNPM, source: 'env' };
  const pm = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).packageManager || '';
  if (!pm.startsWith('pnpm@')) abort(`root packageManager is "${pm}" — expected "pnpm@<version>". Set FUNCTIONS_PNPM to override.`);
  return { pin: pm.slice('pnpm@'.length), source: 'packageManager' };
}

const { pin, source: pinSource } = resolvePin();
const verified = JSON.parse(readFileSync(verifiedPath, 'utf8')).pnpm;
const canary = process.env.FUNCTIONS_CANARY || 'getEcho';

// Recovery guidance printed when the canary build fails.
function recoveryHelp() {
  const localPnpm = tryCapture('pnpm', ['--version']);
  const lines = [
    `Canary deploy of '${canary}' FAILED with pnpm@${pin}.`,
    `  The Cloud Build buildpack could not build with this pnpm version (see the log above).`,
    `  This is usually a buildpack-environment issue (its corepack rejecting the newer pnpm's`,
    `  signature, or lockfile format) — it does NOT necessarily mean pnpm@${pin} is broken for`,
    `  LOCAL dev (your local pnpm is ${localPnpm}). No other functions were deployed.`,
    ``,
    `  To get functions deploying again, pick one:`,
    ``,
    `  Option 1 — keep your setup, pin ONLY the buildpack back to the known-good version:`,
    `      FUNCTIONS_PNPM=${verified} pnpm run deploy:functions`,
    `      (nothing else changes; local dev stays as-is)`,
    ``,
    `  Option 2 — roll the whole project back to pnpm@${verified}:`,
  ];
  if (pinSource === 'packageManager') {
    lines.push(
      `      • set "packageManager": "pnpm@${verified}" in package.json`,
      `      • resync your local pnpm too (packageManager drives it via corepack):`,
      `          corepack install      # if you use corepack — it then auto-uses pnpm@${verified}`,
      `          # or, for a standalone pnpm:  corepack prepare pnpm@${verified} --activate`,
      `      • then: pnpm run deploy:functions`);
  } else {
    lines.push(
      `      • the failing pin came from FUNCTIONS_PNPM, so your package.json / local dev are`,
      `        already untouched — just set FUNCTIONS_PNPM=${verified} (or unset it) and re-run.`);
  }
  return lines.join('\n');
}
const targets = process.argv.slice(2).flatMap((a) => a.split(',')).map((s) => s.trim()).filter(Boolean);

// Build + write the pin into the deployed package.json + prune to a matching prod lockfile.
run('pnpm', ['run', 'build:functions']);
const distPkgPath = join(distDir, 'package.json');
const distPkg = JSON.parse(readFileSync(distPkgPath, 'utf8'));
distPkg.packageManager = `pnpm@${pin}`;
writeFileSync(distPkgPath, JSON.stringify(distPkg, null, 2));
run('pnpm', ['install', '--prod', '--ignore-workspace', '--no-frozen-lockfile'], { cwd: distDir });

// Canary: only when the pin changed since it last deployed successfully.
if (pin !== verified) {
  console.log(`\n⚠ Buildpack pnpm pin changed: ${verified} → ${pin}. Canary-deploying '${canary}' to verify the buildpack…`);
  try {
    run('firebase', ['deploy', '--only', `functions:${canary}`]);
  } catch {
    abort(recoveryHelp());
  }
  writeFileSync(verifiedPath, JSON.stringify(
    { pnpm: pin, _comment: JSON.parse(readFileSync(verifiedPath, 'utf8'))._comment }, null, 2) + '\n');
  console.log(`\n✔ Canary passed. Recorded pnpm@${pin} as verified — commit scripts/functions-pnpm-verified.json.`);
}

// Deploy the requested functions (or all).
const only = targets.length ? targets.map((n) => `functions:${n}`).join(',') : 'functions';
console.log(`\nDeploying ${targets.length ? only : 'ALL functions'}…`);
run('firebase', ['deploy', '--only', only]);
console.log('\n✔ Functions deployed.');
