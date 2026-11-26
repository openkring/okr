#!/usr/bin/env node
/**
 * Compares the main (root) translation bundles of all tenant apps (spec 1.179, phase 1).
 *
 * A runtime-tenant build has ONE main bundle, so every root key whose value differs between apps
 * must become a per-tenant `i18nTenantOverride` row. This script reports those keys per language:
 * the shared value (the most frequent one; ties go to the alphabetically first value) and the
 * tenants that differ from it. A key missing in an app does NOT differ: the shared bundle simply
 * gains it there (e.g. `tag.scs`). Keys in SHARED_FIXED take a fixed generic value instead of the
 * majority, because every tenant has its own (`tag.tenant` = the tenant id).
 *
 *   node scripts/i18n-root-conflicts.mjs          human-readable report
 *   node scripts/i18n-root-conflicts.mjs --json   { shared: {lang: tree}, overrides: [...] }
 *
 * Reads apps/<tenant>-app/src/assets/i18n/<lang>.json; an app without them is skipped.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const LANGS = ['de', 'en', 'fr', 'es', 'it'];

/** Generic shared values; wording as libs/tenant/util `picker.compare_owner_tenant`. */
export const SHARED_FIXED = {
  'tag.tenant': { de: 'Mandant', en: 'Tenant', fr: 'Client', es: 'Cliente', it: 'Cliente' },
};

export function flatten(tree, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(tree)) {
    if (v !== null && typeof v === 'object') Object.assign(out, flatten(v, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = v;
  }
  return out;
}

export function unflatten(flat) {
  const tree = {};
  for (const [path, value] of Object.entries(flat)) {
    const parts = path.split('.');
    let node = tree;
    for (const p of parts.slice(0, -1)) node = node[p] ??= {};
    node[parts.at(-1)] = value;
  }
  return tree;
}

/** bundles: { tenant: flatMap } → { shared: flatMap, differing: { key: { tenant: value } } } */
export function compare(bundles, lang) {
  const tenants = Object.keys(bundles).sort();
  const keys = [...new Set(tenants.flatMap((t) => Object.keys(bundles[t])))].sort();
  const shared = {};
  const differing = {};
  for (const key of keys) {
    const counts = new Map();
    for (const t of tenants) {
      const v = bundles[t][key];
      if (v !== undefined) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const [majority] = [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];
    const value = SHARED_FIXED[key]?.[lang] ?? majority;
    shared[key] = value;
    const off = tenants.filter((t) => bundles[t][key] !== undefined && bundles[t][key] !== value);
    if (off.length) differing[key] = Object.fromEntries(off.map((t) => [t, bundles[t][key]]));
  }
  return { shared, differing };
}

function loadBundles(lang) {
  const bundles = {};
  for (const dir of readdirSync(join(ROOT, 'apps')).filter((d) => d.endsWith('-app')).sort()) {
    const file = join(ROOT, 'apps', dir, 'src/assets/i18n', `${lang}.json`);
    if (existsSync(file)) bundles[dir.replace(/-app$/, '')] = flatten(JSON.parse(readFileSync(file, 'utf8')));
  }
  return bundles;
}

function main() {
  const result = { shared: {}, overrides: [] };
  const perTenantKey = new Map();
  for (const lang of LANGS) {
    const bundles = loadBundles(lang);
    const { shared, differing } = compare(bundles, lang);
    result.shared[lang] = unflatten(shared);
    for (const [key, byTenant] of Object.entries(differing)) {
      for (const tenant of Object.keys(byTenant)) {
        const id = `${tenant} ${key}`;
        if (!perTenantKey.has(id)) perTenantKey.set(id, { tenant, key, values: {} });
      }
    }
    if (!process.argv.includes('--json')) {
      console.log(`${lang}: ${Object.keys(bundles).length} apps, ${Object.keys(shared).length} keys, ${Object.keys(differing).length} differing`);
      for (const [key, byTenant] of Object.entries(differing)) {
        console.log(`  ${key}  shared=${JSON.stringify(shared[key])}  ${JSON.stringify(byTenant)}`);
      }
    }
  }
  // Every override row carries all five languages: the tenant's own value, else the shared one.
  for (const row of perTenantKey.values()) {
    for (const lang of LANGS) {
      const own = loadBundles(lang)[row.tenant]?.[row.key];
      row.values[lang] = own ?? flatten(result.shared[lang])[row.key] ?? '';
    }
    result.overrides.push(row);
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else console.log(`overrides: ${result.overrides.length} (tenant, key) rows`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
