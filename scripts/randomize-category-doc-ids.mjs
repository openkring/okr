/**
 * One-time migration: give every `categories` document a random document id.
 *
 * A category is identified by `name` + `tenants[]`, never by its document id. Verified across
 * libs/, apps/, scripts/, e2e/ and firestore.rules: every read path resolves by name
 * (`AppStore.getCategory` / `tryGetCategory` / `getCategoryItem*` filter `allCategories()` on
 * `c.name`), the CRUD paths in `CategoryService` go through `FirestoreService` with the model's
 * `okey` (already a random id for anything created in-app), and the rules match
 * `/categories/{id}` as a wildcard. So re-keying is behaviour-neutral.
 *
 * The legacy ids are semantic and by now actively misleading: `mcat_default` holds the category
 * NAMED `mcat`, and `_default` is not a tenant — it is the SHARED definition carrying every
 * tenant that has not forked it. Under fork-on-edit a tenant that edits a shared definition gets
 * its own document with the same `name` and `tenants: [TENANTID]`, and is removed from the
 * shared one's `tenants[]` — an id like `mcat_default` cannot express that.
 *
 * Each document is copied to a fresh random id and the old one deleted, in one batch per doc.
 * Documents whose id already looks random (20 chars, base36, no underscore) are skipped, so the
 * script is re-runnable.
 *
 * It also reports (never fixes) invariant violations it would be wrong to paper over:
 *   - `tenants` containing `default` — `default` is a seed marker, not a tenant id
 *   - two non-archived definitions sharing a (name, tenant) — getCategory() picks the first
 *
 * Run with:  node scripts/randomize-category-doc-ids.mjs --dry     (inspect first)
 *            node scripts/randomize-category-doc-ids.mjs           (execute)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const DRY_RUN = process.argv.includes('--dry');
const tag = DRY_RUN ? '[dry] ' : '';

/** Mirror of generateRandomString(20) in shared-util-core. */
function randomKey(size = 20) {
  let result = '';
  while (result.length < size) result += Math.random().toString(36).substring(2);
  return result.substring(0, size);
}

const isRandom = (id) => /^[a-z0-9]{20}$/.test(id) && !/^[a-z]+_/.test(id);

async function main() {
  const snap = await db.collection('categories').get();
  console.log(`${tag}categories: ${snap.size} documents`);

  // --- invariant report -----------------------------------------------------
  const seen = new Map(); // `${name}|${tenant}` -> [docId]
  for (const d of snap.docs) {
    const data = d.data();
    if (!Array.isArray(data.tenants)) {
      console.warn(`  ⚠ ${d.id}: tenants is not an array (${JSON.stringify(data.tenants)}) — invisible to every query`);
      continue;
    }
    if (data.tenants.length === 0) console.warn(`  ⚠ ${d.id}: empty tenants[] — unreachable`);
    if (data.tenants.includes('default')) console.warn(`  ⚠ ${d.id}: tenants[] contains 'default' — not a tenant id`);
    if (!data.name) console.warn(`  ⚠ ${d.id}: no name — unreachable, every lookup is by name`);
    if (data.isArchived === true) continue;
    for (const t of data.tenants) {
      const key = `${data.name}|${t}`;
      const list = seen.get(key) ?? [];
      list.push(d.id);
      seen.set(key, list);
    }
  }
  for (const [key, ids] of seen) {
    if (ids.length > 1) console.warn(`  ⚠ duplicate definition for (${key}): ${ids.join(', ')} — getCategory() takes the first`);
  }

  // --- re-key ---------------------------------------------------------------
  let migrated = 0;
  for (const d of snap.docs) {
    if (isRandom(d.id)) continue;
    const newId = randomKey();
    console.log(`${tag}  ${d.id} -> ${newId}  (name=${d.data().name})`);
    if (!DRY_RUN) {
      const batch = db.batch();
      batch.set(db.collection('categories').doc(newId), d.data());
      batch.delete(d.ref);
      await batch.commit();
    }
    migrated++;
  }
  console.log(`${tag}re-keyed ${migrated} of ${snap.size} documents.`);
}

main().catch((ex) => { console.error(ex); process.exit(1); });
