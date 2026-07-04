#!/usr/bin/env node
// Inject debug IDs, create a Sentry release, upload source maps, and finalize.
// Usage: node scripts/sentry-sourcemaps.mjs <app>   (default: scs-app)
// Requires env: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

// Resolve the repo root relative to this script so it works regardless of cwd.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = process.argv[2] || 'scs-app';
const tenantId = app.replace(/-app$/, '');
const version = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version;
const release = `${tenantId}@${version}`;
const dir = join(repoRoot, 'dist', 'apps', app, 'browser');

for (const v of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
  if (!process.env[v]) {
    console.error(`ERROR: ${v} is not set. Source maps cannot be uploaded.`);
    process.exit(1);
  }
}
if (!existsSync(dir)) {
  console.error(`ERROR: build output not found at ${dir}. Run a production build first.`);
  process.exit(1);
}

const cli = (args) => execFileSync('npx', ['sentry-cli', ...args], { stdio: 'inherit' });

console.log(`Uploading source maps for release ${release} from ${dir}`);
cli(['sourcemaps', 'inject', dir]);

// CRITICAL: `sourcemaps inject` rewrites every JS file in `dir` in place (it inserts a debug-id
// snippet), changing each file's content and therefore its SHA-1. But `ng build` already wrote
// `ngsw.json` with the PRE-injection hashes. If we deploy now, the Angular service worker fetches
// each (injected) file, hashes it, compares against the stale manifest, and rejects it with
// "Hash mismatch (cacheBustedFetchFromNetwork)" — so the update never installs and clients are
// stuck on the old version. Fix: regenerate ngsw.json over the injected files so the manifest
// matches exactly what ships. Only apps with a service worker have a ngsw.json to regenerate.
const ngswManifest = join(dir, 'ngsw.json');
if (existsSync(ngswManifest)) {
  const ngswConfig = join(repoRoot, 'apps', app, 'ngsw-config.json');
  console.log('Regenerating ngsw.json after debug-id injection (avoids service-worker Hash mismatch)…');
  // The `ngsw-config` bin unconditionally does `path.join(process.cwd(), argv)` on both path args,
  // so it requires cwd-relative paths — passing absolutes yields a doubled path (ENOENT). Convert.
  const cwd = process.cwd();
  execFileSync('npx', ['ngsw-config', relative(cwd, dir), relative(cwd, ngswConfig), '/'], {
    stdio: 'inherit',
  });
}

cli(['releases', 'new', release]);
cli(['sourcemaps', 'upload', '--release', release, dir]);
cli(['releases', 'finalize', release]);
console.log(`Done. Release ${release} finalized.`);
