#!/usr/bin/env node
/**
 * Syncs i18n asset entries in every app's project.json.
 *
 * Scans libs for src/i18n/de.json files, generates the correct
 * { glob, input, output } asset entries for each, and replaces
 * the i18n block in each app's build.options.assets array.
 *
 * Run after adding a new lib with i18n files:
 *   node scripts/sync-i18n-assets.mjs
 */

import { execSync } from 'child_process';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

function findI18nLibs() {
  const out = execSync('find libs -path "*/src/i18n/de.json"', { cwd: ROOT }).toString();
  return out.trim().split('\n')
    .filter(Boolean)
    .map(f => {
      const m = f.match(/^libs\/(.+)\/src\/i18n\/de\.json$/);
      return m ? m[1] : null;
    })
    .filter(Boolean)
    .sort();
}

function makeEntry(libPath) {
  return { glob: '*.json', input: `libs/${libPath}/src/i18n`, output: `./assets/i18n/${libPath}` };
}

function isI18nEntry(a) {
  return typeof a === 'object' && a !== null && /^libs\/.+\/src\/i18n$/.test(a.input ?? '');
}

function parseJson(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  // Strip trailing commas before ] or } (project.json may use JSONC)
  const cleaned = raw.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(cleaned);
}

const ANGULAR_EXECUTORS = ['@angular/build:application', '@angular-devkit/build-angular:browser'];

function updateProjectJson(label, projectJsonPath, i18nEntries) {
  if (!existsSync(projectJsonPath)) return;

  const config = parseJson(projectJsonPath);
  const executor = config?.targets?.build?.executor ?? '';
  if (!ANGULAR_EXECUTORS.some(e => executor.startsWith(e.split(':')[0]))) {
    console.log(`  ${label}: not an Angular app (${executor}) — skipping`);
    return;
  }

  const assets = config?.targets?.build?.options?.assets;
  if (!Array.isArray(assets)) {
    console.log(`  ${label}: no assets array — skipping`);
    return;
  }

  // Remove existing i18n entries
  const others = assets.filter(a => !isI18nEntry(a));

  // Insert i18n entries before the first firebase string entry (or at end if absent)
  const insertIdx = others.findIndex(a => typeof a === 'string' && a.includes('firebase'));
  const newAssets = insertIdx === -1
    ? [...others, ...i18nEntries]
    : [...others.slice(0, insertIdx), ...i18nEntries, ...others.slice(insertIdx)];

  config.targets.build.options.assets = newAssets;
  writeFileSync(projectJsonPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`  ${label}: ${i18nEntries.length} i18n entries written`);
}

const libs = findI18nLibs();
console.log(`Found ${libs.length} libs with i18n files`);

const i18nEntries = libs.map(makeEntry);

const apps = readdirSync(join(ROOT, 'apps')).filter(
  a => existsSync(join(ROOT, 'apps', a, 'project.json'))
);
console.log(`Updating apps: ${apps.join(', ')}`);
apps.forEach(app => updateProjectJson(app, join(ROOT, 'apps', app, 'project.json'), i18nEntries));

// The app generator's template is a tokenized copy of an app's project.json and carries its own
// i18n asset block. It is not under apps/, so without this it silently rots and every newly
// scaffolded tenant ships a stale asset list — the scopes added since then 404 at runtime and the
// libs that moved point at directories that no longer exist. Its EJS tokens live inside JSON
// strings, so it round-trips through parse/stringify unharmed.
updateProjectJson(
  'app generator template',
  join(ROOT, 'tools', 'src', 'generators', 'app', 'files', 'project.json__tmpl__'),
  i18nEntries,
);
console.log('Done.');
