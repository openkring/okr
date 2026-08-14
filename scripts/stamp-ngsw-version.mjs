#!/usr/bin/env node
// Stamp package.json's version into an app's ngsw-config.json as `appData.version`.
//
// Angular copies `appData` verbatim into the generated ngsw.json, so a client still running an
// older build learns the version of the update the service worker just downloaded, via
// VersionReadyEvent.latestVersion.appData.version (see VersionCheckService). That is the only
// in-band source: the `app-version` Firestore doc is updated by hand AFTER the hosting deploy,
// so it can still name the version the client already runs.
//
// Run for the app being released, just before its production build (release.mjs does this).
// No per-tenant wiring: a new tenant's ngsw-config.json needs no appData key of its own — it is
// created here. Usage: node scripts/stamp-ngsw-version.mjs <app>   (e.g. scs-app)

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @returns true when the file was changed. */
export function stampNgswVersion(app, version) {
  const path = join(repoRoot, 'apps', app, 'ngsw-config.json');
  if (!existsSync(path)) {
    console.warn(`No ${path} — skipping the service-worker version stamp.`);
    return false;
  }
  const { $schema, appData, ...rest } = JSON.parse(readFileSync(path, 'utf8'));
  if (appData?.version === version) return false;
  // appData first, so a release diff stays a one-liner near the top of the file.
  const updated = { ...($schema ? { $schema } : {}), appData: { ...appData, version }, ...rest };
  writeFileSync(path, JSON.stringify(updated, null, 2) + '\n');
  console.log(`apps/${app}/ngsw-config.json → appData.version ${version}`);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = process.argv[2];
  if (!app) {
    console.error('Usage: node scripts/stamp-ngsw-version.mjs <app>   (e.g. scs-app)');
    process.exit(1);
  }
  stampNgswVersion(app, JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).version);
}
