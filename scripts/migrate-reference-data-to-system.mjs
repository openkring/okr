/**
 * Put the SHARED `categories` and `tags` definitions on the `SYSTEM_TENANT` ('system')
 * sentinel, so a newly provisioned tenant inherits the fleet's reference data with no
 * provisioning step at all.
 *
 * THE DEFECT: both collections carry explicit `tenants[]` lists and nothing in
 * `provision-tenant` extends them. A tenant provisioned after those documents were written
 * inherits NONE of them — `kwa` (Krampfwanderer) had zero categories, so every
 * category-driven select in the app rendered empty (`menu_action`, `section_type`,
 * `page_type`, `roles`, `address_channel`, …), each one also reporting `category X not found`
 * to Sentry. `tags` has the same hole, and had lost `okr` from ~35 definitions as well.
 * `scripts/add-tenant-to-categories.mjs` repairs one tenant; this removes the class.
 *
 * WHY THIS IS ONLY SAFE NOW. The sentinel grants READ fleet-wide but never WRITE
 * (`firestore.rules`: `belongsToTenant()` accepts 'system', `canWriteTenant()` deliberately
 * does not), so a tenant may not edit a shared definition in place. Until v7.27.0 that was a
 * blocker for these two collections rather than a design:
 *   - `tags` already forked correctly (`AocTagStore.saveTags` → `FirestoreService.forkModel`).
 *   - `categories` did NOT — `CategoryService.update()` wrote in place, so moving them to the
 *     sentinel would have made the AOC category editor fail to save for every tenant at once.
 *     v7.27.0 gives `CategoryService.update()` the same copy-on-write fork.
 *   - `forkModel`'s `arrayRemove(tenantId)` is a NO-OP against a `['system']` source, so after
 *     a fork BOTH documents match the tenant. v7.27.0 adds the read-side precedence rule
 *     (`pickForTenant`: own beats shared) in `AppStore.getCategory`/`getTags` and dedupes both
 *     list views. Without it, `getTags`'s `[0]` returns an arbitrary definition.
 * Hence MIN_VERSION below is a HARD gate, not the advisory the workflow-categories migration
 * used: running this against a fleet still on 7.26.x breaks category editing.
 *
 * WHICH DOCUMENTS: a definition naming MORE THAN ONE tenant is the shared default and moves.
 * A definition naming exactly one tenant is somebody's fork (`document_scs`, scs's own
 * `resource.boat`) and is left exactly where it is — that is what a fork is for. Also skipped,
 * with a reason printed for each: the `default` seed marker (documented in the tag-model
 * skill as NOT a tenant id), anything already on the sentinel, and any document whose
 * `tenants` is not an array (`tags/all_tenants` is a dead leftover carrying a STRING there).
 *
 * `mcat` is excluded BY NAME: `scs` and `p13` carry parallel categories named `mcat_scs` /
 * `mcat_p13` rather than forks of `mcat`, so sharing `mcat` fleet-wide would hand them a
 * second, unused membership vocabulary. Whether a tenant wants the generic one is a decision
 * about its membership model, not a migration.
 *
 * NO INDEX CHANGE: an `arrayConfig: CONTAINS` composite index serves `array-contains-any` too.
 *
 * TWO PHASES, as for the workflow categories (`migrate-workflow-categories-to-system.mjs`):
 *   phase 1 (default):        tenants = ['system', ...existing]   <- both query shapes work
 *   phase 2 (--drop-legacy):  tenants = ['system']                <- new tenants inherit
 * Phase 2 is the one that actually removes the provisioning step, so it is the goal — but run
 * phase 1 first, confirm the apps are healthy, then phase 2.
 *
 * Run with:  node scripts/migrate-reference-data-to-system.mjs                  (dry run)
 *            node scripts/migrate-reference-data-to-system.mjs --apply          (phase 1)
 *            node scripts/migrate-reference-data-to-system.mjs --apply --drop-legacy
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: the target list is computed from what is there, so a re-run reports '=' and
 * writes nothing.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const SYSTEM_TENANT = 'system';
/** The release carrying the category fork + the own-beats-shared read precedence. */
const MIN_VERSION = '7.27.0';
/** Not a tenant id — a seed template marker (tag-model skill). */
const SEED_MARKER = 'default';
/** See the header: parallel `mcat_<tenant>` categories, not forks. */
const EXCLUDED_NAMES = ['mcat'];

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

// ── the deploy gate, checked rather than assumed ─────────────────────────────────────────
const versionSnap = await db.collection('app-version').doc('app-version').get();
const deployed = versionSnap.data()?.deployed ?? {};
const stale = [];
console.log(`app-version.deployed (every app needs >= ${MIN_VERSION}):`);
for (const [app, v] of Object.entries(deployed)) {
  const version = typeof v === 'string' ? v : v?.version ?? '?';
  const bad = cmpVersion(version, MIN_VERSION) < 0;
  if (bad) stale.push(app);
  console.log(`  ${bad ? '!' : ' '} ${app}: ${version}`);
}
if (APPLY && stale.length > 0) {
  console.log(`\nABORT: ${stale.length} app(s) below ${MIN_VERSION} (${stale.join(', ')}).`);
  console.log('Those bundles write categories in place and cannot fork a shared definition,');
  console.log('so the category editor would start failing to save. Release first.');
  process.exit(1);
}
console.log('');

// ── the migration ────────────────────────────────────────────────────────────────────────
const identityOf = { categories: d => d.name, tags: d => d.tagModel };

for (const collection of ['categories', 'tags']) {
  const snap = await db.collection(collection).get();
  const planned = [];
  const skipped = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const id = identityOf[collection](data) ?? doc.id;
    const tenants = data.tenants;
    if (!Array.isArray(tenants)) { skipped.push([id, String(tenants), 'tenants is not an array — dead document']); continue; }
    if (EXCLUDED_NAMES.includes(id)) { skipped.push([id, tenants, 'excluded by name — see header']); continue; }
    if (tenants.includes(SEED_MARKER)) { skipped.push([id, tenants, "'default' seed marker — not a tenant"]); continue; }
    const real = tenants.filter(t => t !== SYSTEM_TENANT);
    if (real.length <= 1 && !tenants.includes(SYSTEM_TENANT)) { skipped.push([id, tenants, 'single tenant — somebody\'s own fork']); continue; }

    const target = DROP_LEGACY ? [SYSTEM_TENANT] : [SYSTEM_TENANT, ...real];
    const same = JSON.stringify([...tenants].sort()) === JSON.stringify([...target].sort());
    if (same) { skipped.push([id, tenants, 'already at target']); continue; }
    planned.push([doc, id, tenants, target]);
  }

  console.log(`── ${collection}: ${snap.size} documents, ${planned.length} to move to '${SYSTEM_TENANT}'`);
  for (const [doc, id, tenants, target] of planned) {
    console.log(`  ~ ${id} (${doc.id}): [${tenants}] -> [${target}]`);
    if (APPLY) await doc.ref.update({ tenants: target });
  }
  for (const [id, tenants, why] of skipped) console.log(`  = ${id}: [${tenants}] — ${why}`);
  console.log('');
}

console.log(APPLY ? `done (written, phase ${DROP_LEGACY ? 2 : 1})` : 'dry run — re-run with --apply to write');
