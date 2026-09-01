/**
 * Seeds the DB side of the generic workflow triggers
 * (spec planning/specs/2026-08-29-generic-workflow-triggers-spec.md).
 *
 * The code side ships with the functions deploy and the app release. Two things live in
 * Firestore and cannot ship with either:
 *
 *   1. the `workflow_event` category items — the event picker in the rule form is fed from
 *      the DB category, so without them an admin cannot select the new events;
 *   2. the `menu_action` category item 'workflow' — the action picker in the menu editor is
 *      fed the same way (§3, decision O3).
 *
 * The LABELS are not seeded here. The category carries `translateItems: true`, so every item
 * renders through the app i18n bundle: `libs/system/workflow/feature/src/i18n/*.json` for the
 * events, the app bundle for the menu action. Both ship with the release.
 *
 * Run with:  node scripts/seed-workflow-ui-events.mjs           (dry run, prints what exists)
 *            node scripts/seed-workflow-ui-events.mjs --apply
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: items are matched by `name`, so a re-run reports "already present" and writes
 * nothing. Never removes an item — retiring one is a separate, deliberate decision.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const APPLY = process.argv.includes('--apply');
const tenantArg = process.argv.indexOf('--tenant');
const TENANT = tenantArg >= 0 ? process.argv[tenantArg + 1] : 'scs';

/** category name → the items to add. Icons are names in the `icons` catalogue, not files. */
const SEEDS = {
  workflow_event: [
    // §4 — the missing half of the public admission path
    { name: 'application.stateChanged', icon: 'form-edit' },
    // §2 / §3 — the two content-configurable UI triggers. The spec suggested 'hand-left';
    // it is not in the icons catalogue (verified 2026-08-30), 'button' is.
    { name: 'ui.buttonClicked', icon: 'button' },
    { name: 'ui.menuCalled', icon: 'menu' },
  ],
  // §3 / decision O3 — a call menu item opts into a workflow trigger by BEING this action,
  // not by carrying a marker: two rows that behave differently must not look identical in
  // the editor. Its label lives in the app i18n bundle, like the other menu actions.
  menu_action: [
    { name: 'workflow', icon: 'process' },
  ],
};

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

console.log(`seed-workflow-ui-events: tenant '${TENANT}'${APPLY ? '' : ' (dry run)'}\n`);

for (const [categoryName, seeds] of Object.entries(SEEDS)) {
  const category = await findCategory(categoryName);
  if (!category) {
    console.error(`✗ category '${categoryName}' not found for '${TENANT}' or 'system' — nothing seeded`);
    continue;
  }
  const items = category.data().items ?? [];
  console.log(`${categoryName} (${category.id}, tenants: [${category.data().tenants}])`);
  console.log(`  existing: ${items.map((i) => i.name).join(', ')}`);

  let added = 0;
  for (const seed of seeds) {
    if (items.some((i) => i.name === seed.name)) {
      console.log(`  = ${seed.name} already present`);
      continue;
    }
    if (!(await iconExists(seed.icon))) {
      console.log(`  ! icon '${seed.icon}' is not in the icons catalogue — the item will render blank`);
    }
    items.push({ name: seed.name, icon: seed.icon, color: '', abbreviation: '' });
    added++;
    console.log(`  + ${seed.name} (icon: ${seed.icon})`);
  }
  if (added > 0 && APPLY) await category.ref.update({ items });
  console.log('');
}

console.log(APPLY ? 'done (written)' : 'dry run — re-run with --apply to write');
