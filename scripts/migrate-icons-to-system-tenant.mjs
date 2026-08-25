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
 * Dry-run by default; `--apply` writes.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const SYSTEM_TENANT = 'system';
const APPLY = process.argv.includes('--apply');
if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const snap = await db.collection('icons').get();
const todo = snap.docs.filter(d => !(d.data().tenants ?? []).includes(SYSTEM_TENANT));

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

if (!APPLY) {
  console.log(`\n>>> DRY RUN. Would set tenants: ['${SYSTEM_TENANT}'] on ${todo.length} docs.`);
  process.exit(0);
}
let n = 0;
for (let i = 0; i < todo.length; i += 400) {
  const batch = db.batch();
  for (const d of todo.slice(i, i + 400)) { batch.update(d.ref, { tenants: [SYSTEM_TENANT] }); n++; }
  await batch.commit();
}
console.log(`\n>>> APPLIED — ${n} icon documents now carry tenants: ['${SYSTEM_TENANT}'].`);
