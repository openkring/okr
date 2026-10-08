/**
 * Seeds the `project_state` category (spec 3.14): categories collection, tenants ['system'].
 * The project list, filter and edit form read their labels/icons from it; the item NAMES are
 * fixed because ProjectModel.state stores them (default 'planned' = DEFAULT_PROJECT_STATE).
 *
 * Run with:  node scripts/seed-project-state-category.mjs --dry
 *            node scripts/seed-project-state-category.mjs
 *
 * Idempotent: an existing system category is updated in place (merge), never duplicated.
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv } from 'node:process';

const PROJECT_ID = 'bkaiser-org';
const DRY = argv.includes('--dry');

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const STATE_CATEGORY = {
  name: 'project_state',
  i18n: '@project/project/feature',
  translateItems: true,
  hasAbbreviation: false,
  tenants: ['system'],
  isArchived: false,
  index: 'n:project_state',
  tags: '',
  notes: 'Item names are stored in ProjectModel.state — do not rename them. Seeded by scripts/seed-project-state-category.mjs',
  items: [
    { name: 'planned',   icon: 'bulb',     color: '', abbreviation: '' },
    { name: 'active',    icon: 'cog',      color: '', abbreviation: '' },
    { name: 'completed', icon: 'checkbox', color: '', abbreviation: '' },
    { name: 'cancelled', icon: 'cancel',   color: '', abbreviation: '' },
  ],
};

async function seedCategory() {
  const snap = await db.collection('categories').where('name', '==', STATE_CATEGORY.name).get();
  const existing = snap.docs.find((d) => (d.data().tenants ?? []).includes('system'));
  console.log(`category ${STATE_CATEGORY.name} ${existing ? '(update)' : '(create)'}`);
  if (DRY) return;
  if (existing) await existing.ref.set(STATE_CATEGORY, { merge: true });
  else await db.collection('categories').add(STATE_CATEGORY);
}

console.log(`seed-project-state-category${DRY ? ' (dry run)' : ''}`);
await seedCategory();
