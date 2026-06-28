#!/usr/bin/env node
// Deploy Cloud Functions through the Cloud Build buildpack, with a pnpm-pin safety canary.
//
// The buildpack installs prod deps with the pnpm version pinned in the deployed package.json.
// That pin is DECOUPLED from your local dev pnpm (root packageManager): it defaults to the last
// version that deployed successfully (scripts/functions-pnpm-verified.json), overridable with
// FUNCTIONS_PNPM. To move functions to a new pnpm version, set FUNCTIONS_PNPM=<v>; the script
// deploys ONE trivial function (canary) first to prove the buildpack accepts it, then records it
// as verified and deploys the rest.
//
// Why decoupled: pnpm 11 made "ignored build scripts" a FATAL error (ERR_PNPM_IGNORED_BUILDS —
// e.g. @firebase/util, protobufjs), which the buildpack can't be told to ignore (a project
// .npmrc doesn't take for this setting; only a CLI flag / env var do, neither of which the
// buildpack exposes). pnpm 10.33.2 only warns and exits 0. So functions stay on a known-good
// pin regardless of what local dev uses.
//
// Usage:
//   node scripts/deploy-functions.mjs            # deploy ALL functions
//   node scripts/deploy-functions.mjs fnA fnB    # deploy only these
// Env:
//   FUNCTIONS_PNPM=11.9.0     # try a different buildpack pin (canary-gated)
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

const verified = JSON.parse(readFileSync(verifiedPath, 'utf8')).pnpm;
// Buildpack pin: FUNCTIONS_PNPM override, else the last-verified known-good (NOT packageManager).
const pin = process.env.FUNCTIONS_PNPM || verified;
const canary = process.env.FUNCTIONS_CANARY || 'getEcho';
const targets = process.argv.slice(2).flatMap((a) => a.split(',')).map((s) => s.trim()).filter(Boolean);

// Guidance when a FUNCTIONS_PNPM upgrade attempt fails (local prune or canary build).
function upgradeFailedHelp(stage) {
  return [
    `${stage} FAILED with pnpm@${pin} (set via FUNCTIONS_PNPM).`,
    `  pnpm 11+ makes ignored build scripts fatal (ERR_PNPM_IGNORED_BUILDS) and the buildpack`,
    `  can't be told to ignore them, so this version likely isn't usable for functions yet.`,
    `  The last known-good pin is pnpm@${verified}.`,
    `  Recover: unset FUNCTIONS_PNPM (or set FUNCTIONS_PNPM=${verified}) and re-run.`,
    `  Your local dev pnpm is unaffected — the functions pin is independent of root packageManager.`,
  ].join('\n');
}

// Build + write the pin into the deployed package.json + prune to a matching prod lockfile.
run('pnpm', ['run', 'build:functions']);
const distPkgPath = join(distDir, 'package.json');
const distPkg = JSON.parse(readFileSync(distPkgPath, 'utf8'));
distPkg.packageManager = `pnpm@${pin}`;
writeFileSync(distPkgPath, JSON.stringify(distPkg, null, 2));
try {
  run('pnpm', ['install', '--prod', '--ignore-workspace', '--no-frozen-lockfile'], { cwd: distDir });
} catch (e) {
  if (pin !== verified) abort(upgradeFailedHelp('Local prune'));
  throw e;
}

// Canary: only when trying a pin other than the last-verified one.
if (pin !== verified) {
  console.log(`\n⚠ Trying buildpack pnpm pin ${verified} → ${pin}. Canary-deploying '${canary}' to verify the buildpack…`);
  try {
    run('firebase', ['deploy', '--only', `functions:${canary}`]);
  } catch {
    abort(upgradeFailedHelp('Canary build'));
  }
  writeFileSync(verifiedPath, JSON.stringify(
    { pnpm: pin, _comment: JSON.parse(readFileSync(verifiedPath, 'utf8'))._comment }, null, 2) + '\n');
  console.log(`\n✔ Canary passed. Recorded pnpm@${pin} as verified — commit scripts/functions-pnpm-verified.json.`);
}

// Deploy the requested functions (or all).
const only = targets.length ? targets.map((n) => `functions:${n}`).join(',') : 'functions';
console.log(`\nDeploying ${targets.length ? only : 'ALL functions'} (buildpack pnpm@${pin})…`);
run('firebase', ['deploy', '--only', only]);
console.log('\n✔ Functions deployed.');
