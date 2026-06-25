/**
 * One-time migration: normalise legacy ArticleConfig `properties.image` (single) into
 * `properties.images` (array) and delete the legacy field, for all `type === 'article'` sections.
 *
 * The canonical transform rules are unit-tested in
 * libs/cms/section/util/src/lib/article-image-migration.util.ts (migrateArticleImageProperties);
 * they are inlined here because a .mjs script cannot import the TS util without a build step.
 *
 * Run (dry run, default):  node scripts/migrate-article-images.mjs
 * Run (apply writes):      node scripts/migrate-article-images.mjs --apply
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const APPLY = process.argv.includes('--apply');

async function main() {
  const snap = await db.collection('sections').where('type', '==', 'article').get();
  console.log(`Found ${snap.size} article sections.`);

  let inspected = 0, migrated = 0, skipped = 0;
  let batch = db.batch();
  let pending = 0;

  for (const doc of snap.docs) {
    inspected++;
    const props = doc.data().properties ?? {};
    const hasLegacy = props.image != null;
    const hasImages = Array.isArray(props.images) && props.images.length > 0;
    if (!hasLegacy) { skipped++; continue; }

    // NOTE: properties is a nested map; update nested fields with dotted paths so we
    // only touch the specific fields and do not overwrite the whole properties map.
    const update = { 'properties.image': FieldValue.delete() };
    if (!hasImages) update['properties.images'] = [props.image];

    console.log(`${APPLY ? 'MIGRATE' : '[dry] '} ${doc.id}` + (hasImages ? ' (drop legacy only)' : ' (image -> images[])'));
    if (APPLY) {
      batch.update(doc.ref, update);
      pending++;
      if (pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
    migrated++;
  }

  if (APPLY && pending > 0) await batch.commit();

  console.log('---');
  console.log(`Inspected: ${inspected}  Migrated: ${migrated}  Skipped(no legacy): ${skipped}  ${APPLY ? '(applied)' : '(dry run — pass --apply to write)'}`);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
