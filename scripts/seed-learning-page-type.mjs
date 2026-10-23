/**
 * Adds the item `learning` (learning room, spec 1.115 part 2) to the shared `page_type`
 * category: `categories` collection, the document named `page_type` whose `tenants` contains
 * the 'system' sentinel (see migrate-reference-data-to-system.mjs). The item's label and
 * description come from the page lib's i18n (`page_type.learning.*`), so only the stored value
 * `learning`, an icon and the item shape are written here.
 *
 * Only ADDS one item; every other item and field of the category is left as it is. A tenant
 * that forked `page_type` (own document, `tenants: ['<tenant>']`) is NOT touched and has to add
 * the item in the category editor.
 *
 * Run with:  node scripts/seed-learning-page-type.mjs                 (dry run, writes nothing)
 *            node scripts/seed-learning-page-type.mjs --apply         (writes)
 *            node scripts/seed-learning-page-type.mjs --apply --icon=<icon-name>
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Icons live in the database (icons skill): the default `school` is a guess, check it exists in the
 * `icons` repository or pass --icon. Idempotent: if an item named `learning` is there already,
 * nothing is written.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const APPLY = argv.includes('--apply');
const ITEM_NAME = 'learning';
const iconArg = argv.find((a) => a.startsWith('--icon='));
const ICON = iconArg ? iconArg.slice('--icon='.length) : 'school';

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

console.log(`seed-learning-page-type${APPLY ? ' (APPLY)' : ' (dry run)'}`);

const snap = await db.collection('categories').where('name', '==', 'page_type').get();
const matches = snap.docs.filter((d) => (d.data().tenants ?? []).includes('system'));
if (matches.length !== 1) {
  console.error(
    `expected exactly one shared page_type category (tenants contains 'system'), found ${matches.length}` +
      ` (of ${snap.size} named page_type). Nothing written.`,
  );
  process.exit(1);
}
const ref = matches[0].ref;

const result = await db.runTransaction(async (tx) => {
  const doc = await tx.get(ref);
  const data = doc.data() ?? {};
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.some((i) => i?.name === ITEM_NAME)) return { action: 'exists', items };
  // mirror the shape of the existing items (extra fields such as `state` stay as the siblings have them)
  const sample = items.find((i) => i?.name === 'content') ?? items[0] ?? {};
  const item = { ...sample, name: ITEM_NAME, icon: ICON, abbreviation: '' };
  for (const k of ['price', 'currency', 'periodicity']) delete item[k];
  const next = [...items, item];
  if (APPLY) tx.update(ref, { items: next });
  return { action: 'add', item, count: next.length };
});

if (result.action === 'exists') {
  console.log(`= page_type (${ref.id}) already has the item '${ITEM_NAME}' (${result.items.length} items). Nothing to do.`);
} else {
  console.log(`${APPLY ? 'wrote' : 'would write'} on categories/${ref.id}: add item ${JSON.stringify(result.item)} (-> ${result.count} items)`);
  if (!APPLY) console.log('dry run: re-run with --apply to write.');
}
