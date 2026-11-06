/**
 * Seeds the `menu_type` category — the layouts a main menu can have: left, right, top, segmented
 * (spec planning/specs/2026-11-06-menu-layouts-spec.md §4 and §9).
 *
 * `MenuForm` offers `menuType` on a root menu (action 'main') through `okr-cat-select`, fed from
 * this category. Without it the select has no items, so no layout can be chosen in the editor.
 *
 * The category is a COPY OF THE SHAPE of the live `menu_action` category: same `i18n` scope, same
 * `translateItems: true`, same `tenants`. The LABELS are not seeded here. `translateItems: true`
 * renders every item through the app i18n bundle, `libs/cms/menu/feature/src/i18n/*.json`
 * (`menu_type.<item>.label`), which ships with the release.
 *
 * ⚠️ RUN THIS ONLY AFTER THE RELEASE that ships the layouts, never before.
 *
 *   Seeded earlier, an admin could pick `top` or `segmented` while the apps still run the old
 *   bundle: the labels would be missing (raw keys in the select), the row limit would not be
 *   validated, and the renderer would ignore the value. Once the release is deployed everywhere,
 *   the labels, the validation and the bar all exist, and the picker may offer the choice.
 *
 * Run with:  node scripts/seed-menu-type-category.mjs                  (dry run)
 *            node scripts/seed-menu-type-category.mjs --apply
 *            node scripts/seed-menu-type-category.mjs --tenant kring   (read menu_action of that tenant)
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: the category is matched by `name`, its items by `name`. A re-run reports "already
 * present" and writes nothing. Never removes an item — retiring one is a separate, deliberate
 * decision, and `MenuItemModel.menuType` stores the item NAMES, so they must not be renamed.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const APPLY = process.argv.includes('--apply');
const tenantArg = process.argv.indexOf('--tenant');
const TENANT = tenantArg >= 0 ? process.argv[tenantArg + 1] : 'scs';

const SOURCE = 'menu_action';
const TARGET = 'menu_type';

/** Item names are stored in `MenuItemModel.menuType`. Icons are names in the `icons` catalogue, not files. */
const ITEMS = [
  { name: 'left', icon: 'chevron-back' },
  { name: 'right', icon: 'chevron-forward' },
  { name: 'top', icon: 'chevron-up' },
  { name: 'segmented', icon: 'apps' },
];

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

/** The tenant's category definition, or the shared one it has not forked ('system' sentinel). */
async function findCategory(name) {
  const snap = await db.collection('categories').where('name', '==', name).get();
  const docs = snap.docs.filter((d) => !d.data().isArchived);
  return docs.find((d) => (d.data().tenants ?? []).includes(TENANT))
    ?? docs.find((d) => (d.data().tenants ?? []).includes('system'));
}

/** Warn rather than fail: a missing icon renders blank, it does not break the picker. */
async function iconExists(name) {
  const snap = await db.collection('icons').where('name', '==', name).limit(1).get();
  return !snap.empty;
}

const asItem = (seed) => ({ name: seed.name, icon: seed.icon, color: '', abbreviation: '' });

console.log(`seed-menu-type-category: tenant '${TENANT}'${APPLY ? '' : ' (dry run)'}\n`);

const source = await findCategory(SOURCE);
if (!source) {
  console.error(`✗ category '${SOURCE}' not found for '${TENANT}' or 'system' — nothing seeded`);
  process.exit(1);
}
const shape = source.data();
console.log(`${SOURCE} (${source.id}, tenants: [${shape.tenants}], i18n: ${shape.i18n}, translateItems: ${shape.translateItems})`);
if (shape.translateItems !== true) {
  console.error(`✗ '${SOURCE}' does not translate its items — the labels in the app bundle would never be used`);
  process.exit(1);
}

for (const seed of ITEMS) {
  if (!(await iconExists(seed.icon))) {
    console.log(`  ! icon '${seed.icon}' is not in the icons catalogue — '${seed.name}' will render without an icon`);
  }
}

const existing = await findCategory(TARGET);
if (!existing) {
  const created = {
    ...shape,
    name: TARGET,
    index: typeof shape.index === 'string' ? shape.index.replace(SOURCE, TARGET) : `n:${TARGET}`,
    notes: `Item names are stored in MenuItemModel.menuType — do not rename them. Seeded by scripts/seed-menu-type-category.mjs`,
    items: ITEMS.map(asItem),
  };
  console.log(`\n+ ${TARGET} (new category, tenants: [${created.tenants}])`);
  for (const item of created.items) console.log(`    + ${item.name} (icon: ${item.icon})`);
  if (APPLY) await db.collection('categories').add(created);
} else {
  const items = existing.data().items ?? [];
  console.log(`\n${TARGET} (${existing.id}, tenants: [${existing.data().tenants}])`);
  console.log(`  existing: ${items.map((i) => i.name).join(', ') || '(none)'}`);
  let added = 0;
  for (const seed of ITEMS) {
    if (items.some((i) => i.name === seed.name)) {
      console.log(`  = ${seed.name} already present`);
      continue;
    }
    items.push(asItem(seed));
    added++;
    console.log(`  + ${seed.name} (icon: ${seed.icon})`);
  }
  if (added > 0 && APPLY) await existing.ref.update({ items });
}

console.log(APPLY ? '\ndone (written)' : '\ndry run — re-run with --apply to write');
