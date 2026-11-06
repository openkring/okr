/**
 * LIVE LABEL CHECK — does every label stored in Firestore resolve in the bundle we are about to ship?
 *
 * check-i18n covers keys written in code. `menuItems` and `categories` hold i18n keys as data: a
 * doc an admin edits in the CMS, one the feature picker wrote from a newer catalogue, or one that
 * still names a scope since moved in code carries a key no source file does. It surfaces only as
 * `i18n missing-key` or `i18n scope-load-failed` in Sentry once users open the screen. This reads
 * every non-archived doc and resolves its keys against HEAD's lib bundles, the way the runtime
 * composes them: a menu label through resolveMenuLabelKey, a category item through getItemLabel.
 * A key missing there stays broken even after this release.
 *
 * Like the catalogue check, a finding is a DATA condition, so the release gate asks rather than
 * aborts. It never writes.
 *
 * Usage: node scripts/check-live-labels.mjs     (exit 1 = labels missing, 2 = could not run)
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createJiti } from 'jiti';

import { categoryItemKeys, keyResolves } from './lib/i18n-labels.mjs';

// the runtime's own resolver, as in check-feature-catalogue: this check cannot drift from it
const jiti = createJiti(import.meta.url, { interopDefault: true });
const { resolveMenuLabelKey } = await jiti.import('../libs/cms/menu/util/src/lib/menu-tokens.ts');

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();
  const missing = new Map();   // key -> [doc]
  const note = (key, where) => {
    if (!keyResolves(key)) missing.set(key, [...(missing.get(key) ?? []), where]);
  };

  const menuItems = await db.collection('menuItems').get();
  for (const doc of menuItems.docs) {
    const d = doc.data();
    if (d.isArchived === true) continue;
    for (const label of [d.label, d.labelAlt]) {
      if (typeof label !== 'string' || !label.startsWith('@')) continue;
      const key = resolveMenuLabelKey(label, { version: '0' });
      if (key.startsWith('@')) note(key, `menuItems/${doc.id} (${(d.tenants ?? []).join(', ')})`);
    }
  }

  const categories = await db.collection('categories').get();
  for (const doc of categories.docs) {
    const d = doc.data();
    if (d.isArchived === true) continue;
    for (const key of categoryItemKeys(d)) note(key, `categories/${doc.id}`);
  }

  if (missing.size === 0) {
    console.log(`check-live-labels: ok (${menuItems.size} menuItems, ${categories.size} categories)`);
    return;
  }
  for (const [key, docs] of [...missing].sort()) console.log(`  ${key.padEnd(56)} ${docs.join('; ')}`);
  console.log(`\ncheck-live-labels: ${missing.size} key(s) used by live documents do not resolve in the bundles of HEAD`
    + ' — add them to the lib (all five languages) or fix the document before releasing.');
  process.exit(1);
}

main().catch((err) => {
  console.error(`check-live-labels: could not run — ${err.message}`);
  process.exit(2);
});
