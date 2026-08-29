/**
 * ONE-OFF — put the three workflow catalogue categories on the `SYSTEM_TENANT` ('system')
 * sentinel (spec 2026-08-29-generic-workflow-triggers §5, decision O4).
 *
 * THE DEFECT: `categories/…workflow_event` carries an explicit tenant list
 * (['scs','bka','bkg','p13','kring','okr','elab']). A tenant provisioned tomorrow gets an
 * EMPTY event picker in the workflow rule form; `AppStore.getCategory` degrades to an empty
 * CategoryListModel and reports `category workflow_event not found` to Sentry, so the admin
 * sees an unexplained empty dropdown. The sentinel fixes that for every future tenant with no
 * code, no runbook step and no `provision-tenant` checklist entry to forget.
 *
 * WHY these three and only these three: `workflow_event`, `workflow_probe` and
 * `workflow_action` are the vocabulary of the ENGINE, not of a tenant. Their items are emitted
 * by Cloud Function code and matched by name in `PROBES` / `KNOWN_ACTIONS`; a tenant cannot
 * invent one, and an item a tenant does not use is just an unused dropdown entry. Every other
 * category is genuinely per-tenant tunable and stays on the copy-on-write fork model (see
 * scripts/migrate-icons-to-system-tenant.mjs). A tenant that genuinely wants its own catalogue
 * still forks the document, drops the sentinel and adds its own tenant id — unchanged.
 *
 * WHY IT IS READ-ONLY SHARING: `firestore.rules:99` `belongsToTenant()` grants READ on
 * 'system'; `canWriteTenant()` deliberately does not. Fleet-shared reference data is curated
 * centrally (this script / the Admin SDK), never from a tenant app.
 *
 * NO INDEX CHANGE: an `arrayConfig: CONTAINS` composite index serves `array-contains-any` too.
 *
 * ROLLOUT IS TWO-PHASE, because of the staggered-app-deploy rule (`version` skill). A bundle
 * released BEFORE `getSystemQuery` gained `array-contains-any` still issues plain
 * `array-contains`, and a document carrying ONLY 'system' is invisible to it — which would
 * EMPTY the event picker for the tenants that have one today.
 *
 *   verified 2026-08-29: `array-contains-any` landed in query.util.ts with commit bf67763
 *   ("feat(tenant): 'system'-Sentinel scharfschalten — Icons fleetweit teilen", 2026-08-25),
 *   first released as v7.19.0; HEAD is v7.19.11. This script PRINTS `app-version.deployed`
 *   before doing anything, so the operator can confirm every app is >= 7.19.0.
 *
 *   phase 1 (default):        tenants = ['system', ...existing]   <- both queries work
 *   phase 2 (--drop-legacy):  tenants = ['system']                <- final state
 *
 * Phase 2 is cosmetic; leaving the explicit ids on forever is harmless, it just keeps
 * redundant entries. Do NOT run phase 2 while any app in `app-version.deployed` is < 7.19.0.
 *
 * Run with:  node scripts/migrate-workflow-categories-to-system.mjs                 (dry run)
 *            node scripts/migrate-workflow-categories-to-system.mjs --apply         (phase 1)
 *            node scripts/migrate-workflow-categories-to-system.mjs --apply --drop-legacy
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: the target list is computed from what is there, so a re-run reports '=' and
 * writes nothing.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const SYSTEM_TENANT = 'system';
/** The release in which `getSystemQuery` started using `array-contains-any`. */
const MIN_VERSION = '7.19.0';
const CATEGORIES = ['workflow_event', 'workflow_probe', 'workflow_action'];

const APPLY = process.argv.includes('--apply');
const DROP_LEGACY = process.argv.includes('--drop-legacy');

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const cmpVersion = (a, b) => {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
};

// ── the staggered-deploy check, printed rather than assumed ──────────────────────────────
const versionSnap = await db.collection('app-version').doc('app-version').get();
const deployed = versionSnap.data()?.deployed ?? {};
const stale = Object.entries(deployed).filter(([, v]) => cmpVersion(typeof v === 'string' ? v : v?.version ?? '0', MIN_VERSION) < 0);
console.log(`app-version.deployed (needs >= ${MIN_VERSION} for the sentinel to be visible):`);
for (const [app, v] of Object.entries(deployed)) {
  const version = typeof v === 'string' ? v : v?.version ?? '?';
  console.log(`  ${cmpVersion(version, MIN_VERSION) < 0 ? '!' : ' '} ${app}: ${version}`);
}
if (DROP_LEGACY && stale.length > 0) {
  console.log(`\nABORT: --drop-legacy with ${stale.length} app(s) below ${MIN_VERSION} would empty their event picker.`);
  process.exit(1);
}
console.log('');

// ── the migration ────────────────────────────────────────────────────────────────────────
for (const name of CATEGORIES) {
  const snap = await db.collection('categories').where('name', '==', name).get();
  const docs = snap.docs.filter((d) => !d.data().isArchived);
  if (docs.length === 0) {
    console.log(`! ${name}: not found — skipped`);
    continue;
  }
  if (docs.length > 1) {
    // A fork already exists. Migrating BOTH would show every tenant two identical pickers,
    // and picking one for them is a decision, not a migration.
    console.log(`! ${name}: ${docs.length} live documents (${docs.map((d) => d.id).join(', ')}) — skipped, resolve by hand`);
    continue;
  }
  const doc = docs[0];
  const existing = doc.data().tenants ?? [];
  const target = DROP_LEGACY
    ? [SYSTEM_TENANT]
    : [SYSTEM_TENANT, ...existing.filter((t) => t !== SYSTEM_TENANT)];
  const unchanged = JSON.stringify([...existing].sort()) === JSON.stringify([...target].sort());
  console.log(`${unchanged ? '=' : '~'} ${name} (${doc.id}): [${existing}] -> [${target}]`);
  if (!unchanged && APPLY) await doc.ref.update({ tenants: target });
}

console.log(APPLY ? '\ndone (written)' : '\ndry run — re-run with --apply to write');
