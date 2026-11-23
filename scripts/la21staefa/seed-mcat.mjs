/**
 * ONE-TIME DATA SEED: la21staefa's own list of membership categories.
 *
 * la21staefa's org names the category list 'mcat', but the shared `mcat` document does not list the
 * tenant, so it had no membership categories at all. This creates `mcat_la21staefa` and points
 * `orgs/la21staefa.membershipCategoryKey` at it. A list of its own, because the shared `mcat` has no
 * family category and other tenants use it.
 *
 * COUPLES AND FAMILIES (spec 1.168 §5 option 1): the paying person gets `family` with the household
 * price, the other members get `family-member` at CHF 0. The household (`household_type`) groups the
 * persons for one invoice and one letter. The existing memberships are `active` and stay valid.
 * Item NAMES are stored on MembershipModel: do not rename them.
 *
 * RUN `--apply` ONLY AFTER THE la21staefa-app RELEASE that ships the `mcat_la21staefa` labels
 * (`libs/relationship/membership/feature/src/i18n`). The script reads the live bundles and refuses otherwise.
 *
 * Usage:
 *   node scripts/la21staefa/seed-mcat.mjs            # dry run (default)
 *   node scripts/la21staefa/seed-mcat.mjs --apply    # perform the writes
 * Idempotent: an existing list is left untouched, only the org's key is set.
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const TENANT = 'la21staefa';
const CATEGORY = 'mcat_la21staefa';
const SCOPE = 'relationship/membership/feature';
const LANGUAGES = ['de', 'en', 'fr', 'es', 'it'];

const item = (name, abbreviation, price, icon = 'member-active') => ({
  name, abbreviation, price, icon, currency: 'CHF', periodicity: 'yearly', state: 'active',
});

// Yearly fees as published on the LA21 website (llms.txt), 2026-11-23.
const CATEGORY_DOC = {
  name: CATEGORY,
  i18n: '@' + SCOPE,
  translateItems: true,
  hasAbbreviation: true,
  tenants: [TENANT],
  isArchived: false, // required: getSystemQuery filters `isArchived == false`
  index: `n:${CATEGORY}`,
  tags: '',
  notes: 'Item names are stored on MembershipModel — do not rename them. Seeded by scripts/la21staefa/seed-mcat.mjs',
  items: [
    item('active', 'E', 25),
    item('junior', 'A', 15, 'member-junior'),
    item('family', 'F', 35),
    item('family-member', 'FM', 0),
    item('organisation', 'O', 60),
  ],
};

const apply = process.argv.includes('--apply');

/** The label keys the live app does not serve yet; an unreadable bundle (SPA fallback = HTML) counts as missing. */
async function missingLabels() {
  const missing = [];
  for (const lang of LANGUAGES) {
    let bundle = null;
    try {
      const res = await fetch(`https://${TENANT}-app-54aef.web.app/assets/i18n/${SCOPE}/${lang}.json`, { cache: 'no-store' });
      bundle = JSON.parse(await res.text());
    } catch {
      missing.push(`${lang}: live bundle unreadable`);
      continue;
    }
    for (const { name } of CATEGORY_DOC.items) {
      if (typeof bundle?.[CATEGORY]?.[name]?.label !== 'string') missing.push(`${lang}: ${CATEGORY}.${name}.label`);
    }
  }
  return missing;
}

async function main() {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  console.log(`seed-mcat${apply ? '' : ' (dry run)'}`);

  const missing = await missingLabels();
  if (missing.length > 0) {
    console.log(`labels NOT LIVE YET (${missing.length}), e.g. ${missing[0]}. Release la21staefa-app first.`);
    if (apply) process.exit(1);
  }

  const org = db.collection('orgs').doc(TENANT);
  const ref = db.collection('categories').doc(CATEGORY);
  await db.runTransaction(async (tx) => {
    // a transaction reads before it writes; the list is looked up by name, never by doc id
    const orgSnap = await tx.get(org);
    const lists = await tx.get(db.collection('categories').where('name', '==', CATEGORY).where('tenants', 'array-contains', TENANT));
    if (!orgSnap.exists) throw new Error(`orgs/${TENANT} does not exist`);

    console.log(lists.empty ? `create categories/${CATEGORY}: ${JSON.stringify(CATEGORY_DOC.items)}` : `categories/${lists.docs[0].id} exists, left untouched`);
    console.log(`orgs/${TENANT}.membershipCategoryKey: ${orgSnap.data().membershipCategoryKey} -> ${CATEGORY}`);
    if (!apply) return;
    if (lists.empty) tx.create(ref, CATEGORY_DOC);
    tx.update(org, { membershipCategoryKey: CATEGORY });
  });
  console.log(apply ? 'applied' : 'dry run: nothing written');
}

await main();
