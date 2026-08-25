/**
 * ONE-OFF — move the `icons` catalogue onto the `SYSTEM_TENANT` ('system') sentinel.
 *
 * WHY icons and only icons (2026-08-25):
 *  - The collection is a pure NAME CATALOGUE for the admin icon picker. Rendering never reads
 *    it: `svgIcon` builds an imgix URL from the icon name (`getSvgIconUrl`), so a tenant with
 *    zero icon documents still renders every icon correctly — which is why this was invisible.
 *  - All 401 documents carried `tenants: ['scs']`. Every other tenant (bka, bkg, elab, kring,
 *    okr, p13) therefore saw an EMPTY icon list at /icon/all/c-icon.
 *  - There is nothing tenant-specific in an icon: it is a name and a URL, identical for all.
 *
 * Categories and tags are deliberately NOT migrated: both are genuinely per-tenant tunable
 * (a tag definition's labels, a category list's entries) and both already use the
 * copy-on-write fork model, which the sentinel does not support.
 *
 * ROLLOUT IS TWO-PHASE, because of the staggered-app-deploy rule (`version` skill). The
 * deployed bundles still issue `tenants array-contains <tenantId>`; a document carrying ONLY
 * 'system' is invisible to them. Migrating straight to `['system']` therefore EMPTIES the icon
 * list for scs — the one tenant that had icons — until every app ships the new query. So:
 *
 *   phase 1 (this script, default):  tenants = ['system', 'scs']   <- both queries work
 *   ... release every app on the new getSystemQuery ...
 *   phase 2 (`--drop-scs`):          tenants = ['system']          <- final state
 *
 * Phase 2 is cosmetic; leaving 'scs' on forever is harmless, it just keeps a redundant entry.
 * Do NOT run phase 2 before every app in `app-version.deployed` is on the new bundle.
 *
 * Dry-run by default; `--apply` writes.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SYSTEM_TENANT = 'system';
/** Kept during phase 1 so bundles still on the old `array-contains` query keep seeing icons. */
const LEGACY_TENANT = 'scs';
const APPLY = process.argv.includes('--apply');
const DROP_LEGACY = process.argv.includes('--drop-scs');
if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const snap = await db.collection('icons').get();
const target = DROP_LEGACY ? [SYSTEM_TENANT] : [SYSTEM_TENANT, LEGACY_TENANT];
const todo = snap.docs.filter(d => {
  const t = (d.data().tenants ?? []).slice().sort();
  return JSON.stringify(t) !== JSON.stringify(target.slice().sort());
});

// Guard: once every tenant sees every document, an icon's identity must still be unique or the
// picker lists the same entry twice. Identity is (name, TYPE) — NOT name alone: `type` is the
// icon SET (`icons`, `section`, `filetypes`, `models`), i.e. the `dir` argument of the
// `svgIcon` pipe, and the same name legitimately exists in more than one set
// ('responsibility' is both logo/section/responsibility.svg and logo/icons/responsibility.svg).
// Verify BEFORE writing rather than discovering it in the UI.
const byKey = new Map();
for (const d of snap.docs) {
  const k = `${d.data().type}/${d.data().name}`;
  byKey.set(k, [...(byKey.get(k) ?? []), d.id]);
}
const dupes = [...byKey].filter(([, ids]) => ids.length > 1);

const types = [...new Set(snap.docs.map(d => d.data().type))].sort();
console.log(`icons: ${snap.size} docs, ${todo.length} to migrate`);
console.log(`sets (type): ${types.join(', ')}`);
console.log(`distinct (type, name): ${byKey.size}${dupes.length ? `, ${dupes.length} COLLIDING` : ', no collisions'}`);
for (const [k, ids] of dupes.slice(0, 10)) console.log(`  ! '${k}' -> ${ids.join(', ')}`);
if (dupes.length) {
  console.error('\nAborting: resolve the colliding icons first — the shared picker would list each twice.');
  process.exit(1);
}

console.log(`phase: ${DROP_LEGACY ? '2 (final)' : '1 (compatible with the deployed bundles)'}`);
if (!APPLY) {
  console.log(`\n>>> DRY RUN. Would set tenants: ${JSON.stringify(target)} on ${todo.length} docs.`);
  process.exit(0);
}
let n = 0;
for (let i = 0; i < todo.length; i += 400) {
  const batch = db.batch();
  for (const d of todo.slice(i, i + 400)) { batch.update(d.ref, { tenants: target }); n++; }
  await batch.commit();
}
console.log(`\n>>> APPLIED — ${n} icon documents now carry tenants: ${JSON.stringify(target)}.`);
