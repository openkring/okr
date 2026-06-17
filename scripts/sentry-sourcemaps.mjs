#!/usr/bin/env node
// Inject debug IDs, create a Sentry release, upload source maps, and finalize.
// Usage: node scripts/sentry-sourcemaps.mjs <app>   (default: scs-app)
// Requires env: SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const app = process.argv[2] || 'scs-app';
const tenantId = app.replace(/-app$/, '');
const version = JSON.parse(readFileSync('./package.json', 'utf8')).version;
const release = `${tenantId}@${version}`;
const dir = `./dist/apps/${app}/browser`;

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
cli(['releases', 'new', release]);
cli(['sourcemaps', 'upload', '--release', release, dir]);
cli(['releases', 'finalize', release]);
console.log(`Done. Release ${release} finalized.`);
