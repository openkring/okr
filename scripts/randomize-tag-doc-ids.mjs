/**
 * One-time migration: give every `tags` document a random document id.
 *
 * The legacy ids are semantic (`person_test`, `document_scs`, `location_default`, `icon`) and
 * actively misleading — `<model>_test` is the SHARED definition carrying every real tenant, and
 * `_default` is not a tenant. A tag definition is identified by `tagModel` + `tenants[]`; the id
 * carries no meaning. Every read path already resolves by `tagModel` within the tenant scope
 * (`AppStore.getTags`, `AocTagStore.tagsResource`) — verified: nothing in libs/, apps/ or scripts/
 * reads a tags document by id — so re-keying is behaviour-neutral.
 *
 * Each document is copied to a fresh random id and the old one deleted, in one batch per doc.
 * Documents whose id already looks random (20 chars, base36, no underscore) are skipped, so the
 * script is re-runnable.
 *
 * It also reports (never fixes) two invariant violations it would be wrong to paper over:
 *   - `tenants` containing `default` — `default` is a seed marker, not a tenant id
 *   - two non-archived definitions sharing a (tagModel, tenant) — getTags() would pick one at random
 *
 * Run with:  node scripts/randomize-tag-doc-ids.mjs --dry     (inspect first)
 *            node scripts/randomize-tag-doc-ids.mjs           (execute)
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
  const snap = await db.collection('tags').get();
  console.log(`${tag}tags: ${snap.size} documents`);

  // --- invariant report -----------------------------------------------------
  const seen = new Map(); // `${tagModel}|${tenant}` -> [docId]
  for (const d of snap.docs) {
    const data = d.data();
    if (!Array.isArray(data.tenants)) {
      console.warn(`  ⚠ ${d.id}: tenants is not an array (${JSON.stringify(data.tenants)}) — invisible to every query`);
      continue;
    }
    if (data.tenants.length === 0) console.warn(`  ⚠ ${d.id}: empty tenants[] — unreachable`);
    if (data.tenants.includes('default')) console.warn(`  ⚠ ${d.id}: tenants[] contains 'default' — not a tenant id`);
    if (data.isArchived === true) continue;
    for (const t of data.tenants) {
      const key = `${data.tagModel}|${t}`;
      const list = seen.get(key) ?? [];
      list.push(d.id);
      seen.set(key, list);
    }
  }
  for (const [key, ids] of seen) {
    if (ids.length > 1) console.warn(`  ⚠ duplicate definition for (${key}): ${ids.join(', ')} — getTags() takes the first`);
  }

  // --- re-key ---------------------------------------------------------------
  let migrated = 0;
  for (const d of snap.docs) {
    if (isRandom(d.id)) continue;
    const newId = randomKey();
    console.log(`${tag}  ${d.id} -> ${newId}  (tagModel=${d.data().tagModel})`);
    if (!DRY_RUN) {
      const batch = db.batch();
      batch.set(db.collection('tags').doc(newId), d.data());
      batch.delete(d.ref);
      await batch.commit();
    }
    migrated++;
  }
  console.log(`${tag}re-keyed ${migrated} of ${snap.size} documents.`);
}

main().catch((ex) => { console.error(ex); process.exit(1); });
