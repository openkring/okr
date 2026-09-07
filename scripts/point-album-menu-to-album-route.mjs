/**
 * ONE-TIME DATA FIX — points the main-menu "Album" entry at the standalone album route, so it
 * renders `AlbumPage` (with the `c-album` context menu) instead of a CMS content page.
 *
 * BEFORE: `/private/album/c-contentpage` → `pages/album` (`type: 'content'`, one section
 * `@TID@-album`) → `ContentPage`, whose menu is `c-contentpage`. The album operations were not
 * reachable there.
 *
 * AFTER:  `/album/@TID@-album/c-album` → `AlbumPage` → the `c-album` menu.
 *
 * '@TID@' is a menu url token (see `libs/cms/menu/util/src/lib/menu-tokens.ts`), expanded to the
 * running tenant id by `resolveMenuUrl`. That is what keeps this ONE shared document instead of
 * one fork per tenant: the album's root folder is per-tenant (`folders/scs-album`,
 * `folders/p13-album`, `folders/elab-album`), but the url that names it is not.
 *
 * The token is also why this script must not run before the app carrying that token is
 * deployed — an older client routes to the literal '@TID@' and 404s. Deploy first, then run.
 *
 * Two writes:
 *  1. every non-archived `menuItems` doc named 'album' whose url starts with '/private/album':
 *     url → '/album/@TID@-album/c-album'. There are two today, the shared `album` and the
 *     `album_p13` fork; both are handled by the same query, so a fork made later is picked up.
 *  2. `menuItems/c-contentpage.menuItems[]`: remove the eight `album-*` rows, if present. An
 *     earlier iteration of this change listed them there so a content page could offer them;
 *     with the route switched they belong to `c-album` alone.
 *
 * SAFETY: both writes are surgical. Write 1 only rewrites `url`, and only on a doc whose url
 * still has the old value — a re-run reports "already pointed" and changes nothing. Write 2
 * filters the existing array (never reorders or drops anything else) and is a no-op once the
 * rows are gone. `pages/album` and the `*-album` sections are left ALONE: they become
 * unreferenced, not deleted, so this is reversible by putting the old url back.
 *
 * Usage:
 *   node scripts/point-album-menu-to-album-route.mjs              # dry run (default)
 *   node scripts/point-album-menu-to-album-route.mjs --apply      # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const NEW_URL = '/album/@TID@-album/c-album';
const OLD_URL_PREFIX = '/private/album';

const ALBUM_ROWS = [
  'album-download-all',
  'album-slideshow',
  'album-style',
  'album-folders-toggle',
  'album-copy-link',
  'album-add-folder',
  'album-cover',
  'album-exportraw',
];

const apply = process.argv.includes('--apply');

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();

  console.log(`${apply ? 'APPLY' : 'DRY RUN'}\n`);

  // ── 1. repoint every 'album' nav document (shared doc + any fork) ────────────────
  const albumDocs = await db.collection('menuItems').where('name', '==', 'album').get();
  if (albumDocs.empty) console.log("  !! no menuItems document named 'album' found");

  for (const doc of albumDocs.docs) {
    const { url, tenants, isArchived } = doc.data();
    if (isArchived) {
      console.log(`  skip    menuItems/${doc.id} — archived`);
      continue;
    }
    if (url === NEW_URL) {
      console.log(`  skip    menuItems/${doc.id} — already pointed at the album route`);
      continue;
    }
    if (!url?.startsWith(OLD_URL_PREFIX)) {
      // Somebody pointed this row somewhere else on purpose; do not overwrite that.
      console.log(`  skip    menuItems/${doc.id} — unexpected url '${url}', left untouched`);
      continue;
    }
    if (apply) await doc.ref.update({ url: NEW_URL });
    console.log(`  ${apply ? 'update ' : 'would  '} menuItems/${doc.id} [${(tenants ?? []).join(',')}]`);
    console.log(`          url: ${url} → ${NEW_URL}`);
  }

  // ── 2. take the album rows back off c-contentpage ────────────────────────────────
  const pageRef = db.collection('menuItems').doc('c-contentpage');
  const pageSnap = await pageRef.get();
  if (!pageSnap.exists) {
    console.log('  !! menuItems/c-contentpage is missing — nothing to clean up');
  } else {
    const existing = pageSnap.data().menuItems ?? [];
    const next = existing.filter((row) => !ALBUM_ROWS.includes(row));
    if (next.length === existing.length) {
      console.log('  skip    menuItems/c-contentpage.menuItems — no album rows listed');
    } else {
      if (apply) await pageRef.update({ menuItems: next });
      console.log(`  ${apply ? 'update ' : 'would  '} menuItems/c-contentpage.menuItems -= ${existing.length - next.length} album rows`);
      console.log(`          ${existing.length} → ${next.length} entries`);
    }
  }

  if (!apply) console.log('\nRe-run with --apply to write.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
