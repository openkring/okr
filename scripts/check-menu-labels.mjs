/**
 * MENU LABEL CHECK — does every live menuItems doc have its label in the bundle we are about to ship?
 *
 * check-i18n covers labels written in code (the feature catalogue, the seed scripts). A doc an
 * admin creates or edits in the CMS, or one the feature picker wrote from a newer catalogue,
 * carries a label no source file names — it surfaces only as `i18n missing-key:
 * cmsMenuFeature.item.<name>` in Sentry once users open the menu. This reads every non-archived
 * doc and checks its `label`/`labelAlt` against HEAD's libs/cms/menu/feature/src/i18n/de.json —
 * a label missing there stays broken even after this release.
 *
 * Like the catalogue check, a finding is a DATA condition, so the release gate asks rather than
 * aborts. It never writes.
 *
 * Usage: node scripts/check-menu-labels.mjs     (exit 1 = labels missing, 2 = could not run)
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';

import { hasMenuLabel } from './lib/menu-labels.mjs';

const bundle = JSON.parse(readFileSync('libs/cms/menu/feature/src/i18n/de.json', 'utf8'));

async function main() {
  if (!getApps().length) initializeApp();
  const snap = await getFirestore().collection('menuItems').get();

  const missing = new Map();   // label -> [docId (tenants)]
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.isArchived === true) continue;
    for (const label of [d.label, d.labelAlt]) {
      if (typeof label !== 'string' || !label.startsWith('@item.') || hasMenuLabel(bundle, label)) continue;
      if (!missing.has(label)) missing.set(label, []);
      missing.get(label).push(`${doc.id} (${(d.tenants ?? []).join(', ')})`);
    }
  }

  if (missing.size === 0) {
    console.log(`check-menu-labels: ok (${snap.size} menuItems docs)`);
    return;
  }
  for (const [label, docs] of [...missing].sort()) console.log(`  ${label.padEnd(40)} ${docs.join('; ')}`);
  console.log(`\ncheck-menu-labels: ${missing.size} label(s) used by live menuItems docs are missing from`
    + ' libs/cms/menu/feature/src/i18n/*.json — add them (all five languages) before releasing.');
  process.exit(1);
}

main().catch((err) => {
  console.error(`check-menu-labels: could not run — ${err.message}`);
  process.exit(2);
});
