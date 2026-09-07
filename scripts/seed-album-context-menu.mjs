/**
 * ONE-TIME DATA SEED — creates the `c-album` context menu and its eight own children in
 * `menuItems`, for every tenant.
 *
 * WHY A SCRIPT AND NOT THE FEATURE PICKER
 * The rows are declared in the feature catalogue (`cms` block, `libs/tenant/util/src/lib/
 * feature-blocks.ts`), and the normal way to materialise a catalogue menu spec is a save at
 * `/tenant/features`. That save is too broad for this change: it rewrites
 * `app-config/{tenantId}.enabledFeatures`, re-plans `main_<tenantId>` from the FULL catalogue
 * (`removeKeys` is every block not in the selection), and would append `c-album` — a top-level
 * spec — to the root nav, where a context menu does not belong.
 *
 * Nothing broader is actually required:
 *  - `cms` is `core: true`, so the feature-block gate always passes; `enabledFeatures` needs
 *    no change at all.
 *  - `c-album` is reached by route (`/album/<folderKey>/c-album`), never from the sidebar, so
 *    `main_<tenantId>` needs no change either — exactly like the sibling `c-contentpage`.
 *
 * The field values below are copied from the catalogue specs, so `pnpm catalogue:check` sees
 * no drift and a later picker save finds the documents already correct and leaves them alone.
 *
 * SAFETY: this script only ever CREATES. Every write is `create()`, which fails if the
 * document already exists — a re-run reports "exists, skipped" and changes nothing. It never
 * touches `main_<tenantId>`, `app-config`, or the two shared children (`files-add`, `print`)
 * that `c-album` merely references by name.
 *
 * KNOWN GAP: the shared `menuItems/print` document does not list tenant `bkg`, so the print
 * row will not render there. That is a pre-existing condition of a document shared with
 * `c-contentpage`; fixing it means appending 'bkg' to that document's `tenants[]`, which is a
 * separate decision and is deliberately NOT done here.
 *
 * Usage:
 *   node scripts/seed-album-context-menu.mjs              # dry run (default)
 *   node scripts/seed-album-context-menu.mjs --dry-run    # dry run (explicit)
 *   node scripts/seed-album-context-menu.mjs --apply      # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TENANTS = ['scs', 'p13', 'kring', 'bka', 'bkg', 'elab', 'okr'];

/** Doc id === name === catalogue key — the equality `blockOfMenuKey` depends on. */
function menuItem(name, action, url, roleNeeded, icon, label, extra = {}) {
  return {
    name,
    action,
    url,
    label,
    icon,
    roleNeeded,
    menuItems: [],
    data: [],
    description: '',
    tags: '',
    isArchived: false,
    index: `n:${name} a:${action} k:${name}`,
    tenants: TENANTS,
    ...extra,
  };
}

const DOCS = [
  // The wrapper. `files-add` and `print` are the SHARED documents `c-contentpage` already
  // declares — referenced by name, never created or modified here.
  menuItem('c-album', 'context', '', 'registered', 'albums', '', {
    menuItems: [
      'files-add',
      'album-download-all',
      'album-slideshow',
      'album-style',
      'album-folders-toggle',
      'album-copy-link',
      'print',
      'album-add-folder',
      'album-cover',
      'album-exportraw',
    ],
  }),

  // registered — a member may take things out of the album, but not change it
  menuItem('album-download-all', 'call', 'downloadAll', 'registered', 'download', '@item.album-download-all'),
  menuItem('album-slideshow', 'call', 'slideshow', 'registered', 'play', '@item.album-slideshow'),
  menuItem('album-style', 'call', 'selectStyle', 'registered', 'grid', '@item.album-style'),
  // iconAlt/labelAlt are what make a toggle look different in its two states; the base pair is
  // the INACTIVE state (folders hidden → offer to show them).
  menuItem('album-folders-toggle', 'toggle', 'toggleFolders', 'registered', 'eye-on', '@item.album-folders-toggle', {
    iconAlt: 'eye-off',
    labelAlt: '@item.album-folders-toggle_alt',
  }),
  menuItem('album-copy-link', 'call', 'copyLink', 'registered', 'copy', '@item.album-copy-link'),

  // contentAdmin — these three change the album or export its content
  menuItem('album-add-folder', 'call', 'addFolder', 'contentAdmin', 'add-circle', '@item.album-add-folder'),
  menuItem('album-cover', 'call', 'selectCover', 'contentAdmin', 'image', '@item.album-cover'),
  menuItem('album-exportraw', 'call', 'exportAlbumCsv', 'contentAdmin', 'download', '@item.album-exportraw'),
];

const apply = process.argv.includes('--apply');

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — ${DOCS.length} menuItems documents, tenants: ${TENANTS.join(', ')}\n`);

  let created = 0;
  let skipped = 0;

  for (const data of DOCS) {
    const ref = db.collection('menuItems').doc(data.name);
    const snapshot = await ref.get();

    if (snapshot.exists) {
      console.log(`  skip    menuItems/${data.name} — already exists`);
      skipped++;
      continue;
    }
    if (apply) {
      // create(), not set(): a concurrent creation must fail loudly rather than overwrite.
      await ref.create(data);
    }
    console.log(`  ${apply ? 'create ' : 'would  '} menuItems/${data.name} (${data.action}, ${data.roleNeeded})`);
    created++;
  }

  console.log(`\n${apply ? 'created' : 'would create'}: ${created} · skipped: ${skipped}`);
  if (!apply) console.log('\nRe-run with --apply to write.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
