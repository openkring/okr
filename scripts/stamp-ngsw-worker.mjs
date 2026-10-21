#!/usr/bin/env node
// Stamp the release into the built ngsw-worker.js, then regenerate ngsw.json.
// Usage: node scripts/stamp-ngsw-worker.mjs <app>
//
// WHY: a service worker's Content-Security-Policy is fixed when the browser installs it — it is
// taken from the headers of the ngsw-worker.js response at that moment. The browser re-installs
// the worker only when the script's BYTES change, and Angular's ngsw-worker.js is byte-identical
// from release to release (and across apps — the Sentry debug id is derived from the content).
// So an installed app kept enforcing the connect-src of the day it was installed: a host added
// later (tilecache.rainviewer.com, 2026-10-21) was blocked inside the worker, and every radar
// tile came back as the worker's own synthetic "504 Gateway Timeout". A private window (no
// worker) worked. A one-line comment with app@version makes every release a new worker script.
//
// ngsw-worker.js is itself listed in ngsw.json's hashTable, so the manifest is regenerated after
// the stamp (same call as scripts/sentry-sourcemaps.mjs, which regenerates it again after its own
// debug-id injection).
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2];
if (!app) {
  console.error('usage: node scripts/stamp-ngsw-worker.mjs <app>');
  process.exit(2);
}
const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
const dir = join(repoRoot, 'dist', 'apps', app, 'browser');
const worker = join(dir, 'ngsw-worker.js');
const manifest = join(dir, 'ngsw.json');

if (!existsSync(worker) || !existsSync(manifest)) {
  console.log(`  ${app} has no service worker in ${relative(repoRoot, dir)} — nothing to stamp.`);
  process.exit(0);
}

appendFileSync(worker, `\n// okr-release: ${app}@${version}\n`);
console.log(`  stamped ngsw-worker.js with ${app}@${version}`);

// The `ngsw-config` bin joins both path args onto process.cwd(), so they must be cwd-relative.
const cwd = process.cwd();
execFileSync('npx', ['ngsw-config', relative(cwd, dir), relative(cwd, join(repoRoot, 'apps', app, 'ngsw-config.json')), '/'], {
  stdio: 'inherit',
});
console.log('  regenerated ngsw.json');
