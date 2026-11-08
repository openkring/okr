/**
 * Seeds the email templates (spec 1.141, design §9) into `templates/{okey}` + `templates/{okey}/versions/1`
 * as PUBLISHED version 1: the standard and the Logo-only layout of one tenant (`email-layout_<tenantId>`,
 * `email-layout-logo_<tenantId>`), and the shared
 * (`tenants: ['system']`) plain layout and password-reset text.
 *
 * Default mode SKIPS a doc that exists, so a re-run never overwrites a tenant's edit. `--update <okey>` is the
 * one deliberate exception: it publishes the CURRENT source of that one doc as the next version
 * (`versions/<currentVersion + 1>`, `currentVersion` moved) and prints old and new version. The previous
 * version stays in the history, so it can be rolled back. The layout row for `email-layout_<t>` is derived
 * from the okey.
 *
 * The layout sources live in scripts/email-templates/. The per-tenant values (logo URL, alt text, header link,
 * footer name) come from planning/reference/email-layout-seed.json — the public repo names no tenant.
 *
 * SAFETY: dry run by default (it only READS Firestore to report CREATE / SKIP). Writes use batch.create(), so a
 * doc that appeared meanwhile fails the batch instead of being overwritten. --update refuses a doc with an
 * open draft (draftVersion), because the next version number would collide with it.
 *
 * Usage:
 *   node scripts/seed-email-templates.mjs --tenant <id> [--shared]            # dry run (default)
 *   node scripts/seed-email-templates.mjs --tenant <id> --shared --apply      # write
 *   node scripts/seed-email-templates.mjs --update <okey> [--apply]           # publish the source as next version
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { existsSync, readFileSync } from 'node:fs';

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { docForOkey, nextVersion, parseArgs, templateDocs } from './seed-email-templates.logic.mjs';

const ROWS_FILE = new URL('../planning/reference/email-layout-seed.json', import.meta.url);
const cli = parseArgs(process.argv.slice(2));
if (cli.error) {
  console.error(cli.error);
  process.exit(1);
}
const { apply } = cli;

function loadRows() {
  if (!existsSync(ROWS_FILE)) throw new Error('planning/reference/email-layout-seed.json is missing (private planning submodule).');
  return JSON.parse(readFileSync(ROWS_FILE, 'utf8')).rows ?? {};
}

async function main() {
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();
  console.log(apply ? 'APPLY MODE\n' : 'DRY RUN (no writes) — pass --apply to write.\n');
  if (cli.update) await update(db, cli.update);
  else await seed(db);
}

async function seed(db) {
  const docs = [];
  if (cli.tenant) {
    const row = loadRows()[cli.tenant];
    if (!row) throw new Error(`No row for tenant ${cli.tenant} in the seed table.`);
    docs.push(...templateDocs({ ...row, tenant: cli.tenant }));
  }
  if (cli.shared) docs.push(...templateDocs());

  const batch = db.batch();
  let created = 0;
  for (const doc of docs) {
    const ref = db.doc(doc.path);
    if ((await ref.get()).exists) {
      console.log(`SKIP    ${doc.path} — exists`);
      continue;
    }
    console.log(`CREATE  ${doc.path} (${doc.template.kind}, tenants ${JSON.stringify(doc.template.tenants)}) + versions/${doc.versionId} · html ${doc.version.html.length} chars, text ${doc.version.text.length} chars`);
    batch.create(ref, doc.template);
    batch.create(ref.collection('versions').doc(doc.versionId), doc.version);
    created++;
  }
  if (apply && created > 0) await batch.commit();
  console.log(`\n${apply ? 'created' : 'would create'}: ${created} · skipped: ${docs.length - created}`);
}

async function update(db, okey) {
  const ref = db.doc(`templates/${okey}`);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`templates/${okey} does not exist. Seed it first (without --update).`);
  const current = snap.data();
  if (current.draftVersion) throw new Error(`templates/${okey} has an open draft (version ${current.draftVersion}); publish or discard it first.`);
  const next = nextVersion(current);
  const versionRef = ref.collection('versions').doc(String(next));
  if ((await versionRef.get()).exists) throw new Error(`templates/${okey}/versions/${next} already exists.`);

  const doc = docForOkey(okey, loadRows(), { version: next, changelog: 'Update from the seed source' });
  console.log(`UPDATE  templates/${okey} — version ${current.currentVersion ?? 0} -> ${next} · html ${doc.version.html.length} chars, text ${doc.version.text.length} chars`);
  if (apply) {
    const batch = db.batch();
    batch.create(versionRef, doc.version);
    batch.update(ref, { currentVersion: next, status: 'published', updatedAt: doc.version.publishedAt, updatedBy: 'seed' });
    await batch.commit();
    console.log(`\npublished version ${next}.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
