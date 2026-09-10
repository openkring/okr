/**
 * Put the SHARED CMS shell pages — and the shared sections they are built from — on the
 * `SYSTEM_TENANT` ('system') sentinel, so every tenant (including one provisioned tomorrow)
 * inherits them with no per-tenant `tenants[]` entry and no provisioning step.
 *
 * THE DEFECT, same class as `migrate-reference-data-to-system.mjs`: these documents carry
 * explicit `tenants[]` lists that nothing extends. A tenant not on the list cannot read the
 * page, so the matching menu row could not be catalogued in `/tenant/features` either — the
 * picker would have handed it a menu entry pointing at a page it cannot load. `kwa` is the
 * live example: it has `privacy` (added by hand) but neither `impressum`, `terms`, `dashboard`
 * nor `help`.
 *
 * WHICH DOCUMENTS AND WHY THEY ARE SAFE TO SHARE. Every page below is a SHELL: the tenant-
 * specific content is not in the page document at all.
 *   - `impressum`  — `sections: ['@TID@_impressum']`, i.e. the section id itself is per-tenant
 *                    (`PageStore` expands `@TID@`). The shell was always identical.
 *   - `privacy`, `terms` — the legal texts ARE the same for every tenant (one operator, one
 *                    jurisdiction); the per-tenant operator details live in the sections that
 *                    already read them from data.
 *   - `dashboard`  — `type: dashboard`, sections `d-*`, each of which queries the CURRENT
 *                    tenant's own data at runtime.
 *   - `help`       — identical today; tenant-specific help videos, when they exist, follow the
 *                    `@TID@_…` section pattern `impressum` already uses rather than forking
 *                    the shell.
 *   - the test page (`wDgtGIqwKiFoZGUChLBW`) — a section showcase, tenant-independent.
 * `cms-graph`'s page was moved by hand in the same change (it is the sitemap: it renders the
 * tenant's OWN menu graph at runtime and holds no content at all).
 *
 * SECTIONS MOVE WITH THEIR PAGE. A shared page whose sections a tenant may not read renders
 * as an empty page — both layers query through `getSystemQuery`, so both need the sentinel.
 * `@TID@_*` sections are per-tenant BY CONSTRUCTION and are never touched.
 *
 * WRITES ARE NOT SHARED — that is the point of the sentinel (`firestore.rules`:
 * `belongsToTenant()` accepts 'system', `canWriteTenant()` deliberately does not). So editing
 * one of these pages in place from a tenant app is refused by rules. That is only safe because
 * `PageService.update` / `SectionService.update` now COPY-ON-WRITE: a tenant editing a shared
 * page forks it to `<okey>_<tenantId>`, which is exactly the id both services' `read()` already
 * prefer over the shared original. Same shape as `CategoryService.update` (v7.27.0), with the
 * deterministic key that page/section resolution requires instead of `forkModel`'s random one.
 *
 * NO INDEX CHANGE: an `arrayConfig: CONTAINS` composite index serves `array-contains-any` too.
 *
 * TWO PHASES, as in the reference-data migration:
 *   phase 1 (default):        tenants = ['system', ...existing]   <- both query shapes work
 *   phase 2 (--drop-legacy):  tenants = ['system']                <- new tenants inherit
 *
 * Run with:  node scripts/migrate-shared-pages-to-system.mjs                  (dry run)
 *            node scripts/migrate-shared-pages-to-system.mjs --apply          (phase 1)
 *            node scripts/migrate-shared-pages-to-system.mjs --apply --drop-legacy
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Idempotent: the target list is computed from what is there, so a re-run reports '=' and
 * writes nothing.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'bkaiser-org';
const SYSTEM_TENANT = 'system';

/** The shell pages, by document id — the ids the menu rows' urls embed. */
const PAGE_IDS = ['impressum', 'privacy', 'terms', 'dashboard', 'help', 'wDgtGIqwKiFoZGUChLBW'];

const APPLY = process.argv.includes('--apply');
const DROP_LEGACY = process.argv.includes('--drop-legacy');

if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
const db = getFirestore();

const targetFor = (tenants) => {
  const real = tenants.filter(t => t !== SYSTEM_TENANT);
  return DROP_LEGACY ? [SYSTEM_TENANT] : [SYSTEM_TENANT, ...real];
};
const isSame = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

/** Every doc to move, collected first so the dry run prints the complete set. */
const planned = [];   // [ref, label, tenants, target]
const skipped = [];   // [label, reason]

for (const pageId of PAGE_IDS) {
  const snap = await db.collection('pages').doc(pageId).get();
  if (!snap.exists) { skipped.push([`pages/${pageId}`, 'no such document']); continue; }
  const data = snap.data();
  const tenants = data.tenants;
  if (!Array.isArray(tenants)) { skipped.push([`pages/${pageId}`, 'tenants is not an array']); continue; }

  const target = targetFor(tenants);
  if (isSame(tenants, target)) skipped.push([`pages/${pageId}`, 'already at target']);
  else planned.push([snap.ref, `pages/${pageId}`, tenants, target]);

  // The sections this page is built from. A `@TID@` id is per-tenant by construction and is
  // never shared; anything else is part of the shared shell and moves with it.
  for (const sectionId of data.sections ?? []) {
    if (String(sectionId).includes('@TID@')) { skipped.push([`sections/${sectionId}`, 'per-tenant section (@TID@) — left alone']); continue; }
    const sectionSnap = await db.collection('sections').doc(sectionId).get();
    if (!sectionSnap.exists) { skipped.push([`sections/${sectionId}`, `no such document (listed by pages/${pageId})`]); continue; }
    const sectionTenants = sectionSnap.data().tenants;
    if (!Array.isArray(sectionTenants)) { skipped.push([`sections/${sectionId}`, 'tenants is not an array']); continue; }
    if (planned.some(([ref]) => ref.path === sectionSnap.ref.path)) continue;  // listed by two pages

    const sectionTarget = targetFor(sectionTenants);
    if (isSame(sectionTenants, sectionTarget)) skipped.push([`sections/${sectionId}`, 'already at target']);
    else planned.push([sectionSnap.ref, `sections/${sectionId}`, sectionTenants, sectionTarget]);
  }
}

console.log(`SHARED CMS SHELL -> '${SYSTEM_TENANT}'  (phase ${DROP_LEGACY ? 2 : 1})\n`);
console.log(`${planned.length} document(s) to move:`);
for (const [ref, label, tenants, target] of planned) {
  console.log(`  ~ ${label}: [${tenants}] -> [${target}]`);
  if (APPLY) await ref.update({ tenants: target });
}
console.log(`\n${skipped.length} skipped:`);
for (const [label, why] of skipped) console.log(`  = ${label} — ${why}`);

console.log(`\n${APPLY ? `done (written, phase ${DROP_LEGACY ? 2 : 1})` : 'dry run — re-run with --apply to write'}`);
