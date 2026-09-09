/**
 * Give a tenant the fleet's GENERAL categories — the provisioning step nothing performs today.
 *
 * THE DEFECT: `provision-tenant` never touches the `categories` collection, and category
 * documents carry an explicit `tenants[]` list. So a tenant provisioned after those documents
 * were written inherits NONE of them: `AppStore.getCategory` degrades to an empty
 * `CategoryListModel` and every category-driven select in the app renders with no options —
 * the `menu_action` type filter, `section_type`, `page_type`, `calevent_type`, `roles`,
 * `address_channel`, `gender`, … Each one also reports `category <name> not found` to Sentry,
 * so the symptom an admin sees is an unexplained empty dropdown. Found on `kwa`
 * (Krampfwanderer), which had zero categories.
 *
 * WHY NOT THE 'system' SENTINEL: it is the right answer for a category that is ENGINE
 * vocabulary — `workflow_event`/`workflow_probe`/`workflow_action` were moved there for
 * exactly this reason (scripts/migrate-workflow-categories-to-system.mjs). It is the WRONG
 * answer for a tenant-tunable category: `firestore.rules` grants READ on 'system' but
 * `canWriteTenant()` deliberately refuses WRITE, and `CategoryService` has no copy-on-write
 * fork the way `MenuService`/`TagService` do. A general category on 'system' would therefore
 * become uneditable from the AOC category editor for every tenant at once. Until categories
 * grow that fork, a tenant that may tune its own items has to be listed by id.
 *
 * SCOPE — deliberately narrow. Only documents whose `tenants[]` is EXACTLY the fleet's
 * standard list are touched. That leaves alone, by construction:
 *   - 'system' documents (the three workflow ones) — already fleet-wide,
 *   - tenant-specific documents (`mcat_scs`, `mcat_srv`, `mcat_p13`) — somebody's own set,
 *   - `mcat` (a deliberate subset) — whether a new tenant wants the generic membership
 *     categories is a decision about its membership model, not a migration.
 * Anything outside that shape is REPORTED, never written, so the operator sees it.
 *
 * Run with:  node scripts/add-tenant-to-categories.mjs <tenantId>            (dry run)
 *            node scripts/add-tenant-to-categories.mjs <tenantId> --apply
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: a tenant already listed reports '=' and is not written.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
/** The fleet's standard list. A document carrying exactly this set is a general category. */
const STANDARD = ['scs', 'bka', 'bkg', 'p13', 'kring', 'okr', 'elab'];

const args = process.argv.slice(2).filter(a => a !== '--apply');
const APPLY = process.argv.includes('--apply');
const TENANT = args[0];

if (!TENANT) {
  console.error('usage: node scripts/add-tenant-to-categories.mjs <tenantId> [--apply]');
  process.exit(1);
}

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const key = list => [...list].sort().join(',');
const STANDARD_KEY = key(STANDARD);

const snap = await db.collection('categories').get();
const planned = [];
const skipped = [];

for (const doc of snap.docs) {
  const data = doc.data();
  const tenants = data.tenants ?? [];
  const name = data.name ?? doc.id;
  if (tenants.includes(TENANT)) { skipped.push([name, tenants, 'already listed']); continue; }
  if (tenants.includes('system')) { skipped.push([name, tenants, 'system — fleet-wide already']); continue; }
  if (key(tenants) !== STANDARD_KEY) { skipped.push([name, tenants, 'not the standard list — decide by hand']); continue; }
  planned.push([doc, name, tenants]);
}

console.log(`categories: ${snap.size} documents, ${planned.length} to extend with '${TENANT}'\n`);
for (const [doc, name, tenants] of planned) {
  console.log(`~ ${name} (${doc.id}): [${tenants}] -> [${[...tenants, TENANT]}]`);
  if (APPLY) await doc.ref.update({ tenants: [...tenants, TENANT] });
}
console.log(`\nleft untouched (${skipped.length}):`);
for (const [name, tenants, why] of skipped) console.log(`  = ${name}: [${tenants}] — ${why}`);

console.log(APPLY ? `\ndone — ${planned.length} written` : '\ndry run — re-run with --apply to write');
