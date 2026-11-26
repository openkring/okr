#!/usr/bin/env node
/**
 * Writes the per-tenant labels of the main translation bundle as `i18nTenantOverride` rows
 * (spec 1.179, phase 1, plan Task 3).
 *
 * The tenant apps used to carry their own main bundle; they now share
 * libs/shared/i18n/src/root/<lang>.json. Every root key whose value differed between apps
 * (scripts/i18n-root-conflicts.mjs) becomes one row per tenant: module = the part before the last
 * dot, key = the last part (I18nOverrideService turns module `tag` + key `club` into `tag.club`).
 * Each row carries the tenant's own value in all five languages, so nothing changes for anybody.
 *
 * Run it BEFORE an app with the shared bundle is released. It reads the per-app bundles, so run it
 * from a checkout that still has them (before Task 3 deletes them) or pass --from <json> with the
 * output of `node scripts/i18n-root-conflicts.mjs --json` saved earlier.
 *
 * A (tenant, module, key) that already has a non-archived row is skipped.
 *
 * Usage:
 *   node scripts/migrate-i18n-root-overrides.mjs                 # dry run (default)
 *   node scripts/migrate-i18n-root-overrides.mjs --apply         # write
 *   node scripts/migrate-i18n-root-overrides.mjs --from x.json   # rows from a saved report
 * Requires: gcloud auth application-default login.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTION = 'i18nTenantOverride';
const LANGS = ['de', 'en', 'fr', 'es', 'it'];

export function toOverrideDoc(row) {
  const cut = row.key.lastIndexOf('.');
  const doc = {
    tenantId: row.tenant,
    tenants: [row.tenant],
    module: row.key.slice(0, cut),
    key: row.key.slice(cut + 1),
    isHtml: false,
    isArchived: false,
  };
  for (const lang of LANGS) doc[lang] = row.values[lang];
  return doc;
}

function loadRows() {
  const at = process.argv.indexOf('--from');
  const json = at > 0
    ? readFileSync(process.argv[at + 1], 'utf8')
    : execFileSync('node', [resolve(fileURLToPath(import.meta.url), '..', 'i18n-root-conflicts.mjs'), '--json'], { encoding: 'utf8' });
  return JSON.parse(json).overrides;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = loadRows();
  if (!getApps().length) initializeApp();
  const col = getFirestore().collection(COLLECTION);
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${rows.length} rows from the bundles\n`);
  let created = 0;
  for (const row of rows) {
    const doc = toOverrideDoc(row);
    const existing = (await col.where('tenants', 'array-contains', doc.tenantId).where('module', '==', doc.module).where('key', '==', doc.key).get())
      .docs.filter((d) => d.data().isArchived !== true);
    if (existing.length) {
      console.log(`  skip    ${doc.tenantId} ${doc.module}.${doc.key} (exists: ${existing.map((d) => d.id).join(', ')}, de=${JSON.stringify(existing[0].data().de)})`);
      continue;
    }
    if (apply) await col.doc().create(doc);
    console.log(`  ${apply ? 'created' : 'would create'} ${doc.tenantId} ${doc.module}.${doc.key} de=${JSON.stringify(doc.de)}`);
    created++;
  }
  console.log(`\n${created} to create${apply ? ' — written' : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
