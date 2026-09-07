/**
 * ONE-TIME DATA FIX — retires the CMS content page that used to back `/private/album` for the
 * tenants whose menu now goes straight to the album route.
 *
 * Context: the main-menu "Album" entry was repointed to `/album/@TID@-album/c-album`
 * (`point-album-menu-to-album-route.mjs`), which renders `AlbumPage` from the storage folder.
 * `pages/album` and its per-tenant `*-album` section are no longer reachable for those tenants.
 *
 * DELETE SEMANTICS (see the `deleting-models` skill — this is exactly the case it exists for):
 *  - `pages/album` is ONE document shared by all seven tenants. Archiving it would make the page
 *    vanish for bka, bkg, elab, kring and okr as well, whose menus still point at it. The correct
 *    operation is a DETACH: remove the tenant from `tenants[]`, leave the document in place.
 *  - `sections/p13-album` and `sections/scs-album` carry a single tenant each, i.e. the tenant
 *    being retired is the LAST one, so `isArchived: true` is correct there — never an emptied
 *    `tenants: []`, which no client (not even a tenant admin) could ever read back.
 * That is the `getDeletePatch(tenants, tenantId)` rule, applied by hand because this is a
 * server-side script and not a service call.
 *
 * Archiving rather than deleting the sections keeps the album's persisted configuration
 * (`albumStyle`, `showPdfs`, `showVideos`, `imageStyle`) recoverable — `AlbumPage` reads those
 * from query parameters instead, and nothing else carries them.
 *
 * SAFETY: no document is deleted. A tenant already detached / a section already archived is
 * reported and skipped, so a re-run is a no-op. `tenants[]` is filtered, never rebuilt, so a
 * tenant this script does not name cannot be dropped by it.
 *
 * Usage:
 *   node scripts/retire-album-content-page.mjs              # dry run (default)
 *   node scripts/retire-album-content-page.mjs --apply      # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TENANTS = ['p13', 'scs'];

/** The shared page: detach each tenant. */
const SHARED_PAGE = { collection: 'pages', id: 'album' };

/** The single-tenant sections: archive (that tenant is the last one). */
const SECTIONS = [
  { collection: 'sections', id: 'p13-album', tenant: 'p13' },
  { collection: 'sections', id: 'scs-album', tenant: 'scs' },
];

const apply = process.argv.includes('--apply');

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — retiring for: ${TENANTS.join(', ')}\n`);

  // ── 1. detach the tenants from the SHARED page ──────────────────────────────────
  const pageRef = db.collection(SHARED_PAGE.collection).doc(SHARED_PAGE.id);
  const pageSnap = await pageRef.get();
  if (!pageSnap.exists) {
    console.log(`  !! ${SHARED_PAGE.collection}/${SHARED_PAGE.id} does not exist`);
  } else {
    const tenants = pageSnap.data().tenants ?? [];
    const next = tenants.filter((t) => !TENANTS.includes(t));
    const removed = tenants.filter((t) => TENANTS.includes(t));

    if (removed.length === 0) {
      console.log(`  skip    ${SHARED_PAGE.collection}/${SHARED_PAGE.id} — neither tenant is listed`);
    } else if (next.length === 0) {
      // Would leave the document unreadable by everyone; archive instead. Cannot happen with
      // today's data (five other tenants remain), but the rule must not depend on that.
      console.log(`  !! ${SHARED_PAGE.collection}/${SHARED_PAGE.id} — detaching would empty tenants[]; archive it instead`);
    } else {
      if (apply) await pageRef.update({ tenants: next });
      console.log(`  ${apply ? 'detach ' : 'would  '} ${SHARED_PAGE.collection}/${SHARED_PAGE.id} — remove ${removed.join(', ')}`);
      console.log(`          tenants: [${tenants.join(', ')}] → [${next.join(', ')}]`);
    }
  }

  // ── 2. archive the single-tenant sections ───────────────────────────────────────
  for (const { collection, id, tenant } of SECTIONS) {
    const ref = db.collection(collection).doc(id);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  skip    ${collection}/${id} — does not exist`);
      continue;
    }
    const data = snap.data();
    const tenants = data.tenants ?? [];
    if (data.isArchived === true) {
      console.log(`  skip    ${collection}/${id} — already archived`);
      continue;
    }
    // Guard the assumption the archive rests on: this must be the tenant's own section.
    if (tenants.length !== 1 || tenants[0] !== tenant) {
      console.log(`  !! ${collection}/${id} — tenants is [${tenants.join(', ')}], expected [${tenant}]; skipped (a shared section must be detached, not archived)`);
      continue;
    }
    if (apply) await ref.update({ isArchived: true });
    console.log(`  ${apply ? 'archive' : 'would  '} ${collection}/${id} — last tenant (${tenant})`);
  }

  if (!apply) console.log('\nRe-run with --apply to write.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
