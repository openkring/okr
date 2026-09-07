/**
 * ONE-TIME DATA SEED — creates the two `menuItems` documents that make the FOLDER LIST
 * reachable, and hangs the nav row under the shared `cms-menu` parent.
 *
 * WHY: `FolderList` / `FolderEditModal` / `FolderStore` have existed since before the
 * 2026-08-04 `folder`→`document` block merge, but had no route and no importer. The folder
 * edit form is the only UI for `FolderModel.membersMayUpload` — the flag `firestore.rules`
 * gates member uploads on (`match /docs/{id}`, `allow create`) — so that flag was unsettable
 * by any admin through the app. The route now exists (`/folder/:contextMenuName`, guarded
 * `isContentAdminGuard`), and these documents are what put a row in front of it.
 *
 * Created (doc id === name === catalogue key, matching `planMenuOpsForBlocks`):
 *   - `folder-all`  navigate → /folder/c-folders   (contentAdmin)
 *   - `c-folders`   context wrapper, one child `folder-add`
 *
 * `folder-add` is NOT created: it is the SHARED document `c-folder`/`c-documents` already use
 * on the document list. `FolderList.onPopoverDismiss` was changed to dispatch that document's
 * existing url ('addFolder') rather than introduce a second doc under the same name.
 *
 * Also appends `folder-all` to the shared `cms-menu` parent's `menuItems[]`, next to
 * `document-all` — without that the row exists but hangs off nothing and never renders.
 *
 * NAMING: the wrapper is `c-folders` (plural). `c-folder` (singular) is a DIFFERENT live
 * document — the group view's "Dateien" segment hoists it from code onto a DocumentList, and
 * its children are document actions. Reusing that name would put the wrong action sheet on
 * both screens.
 *
 * SAFETY: the two creates are `create()`, which fails on an existing document, so a re-run
 * skips them. The `cms-menu` append is computed from the current array and only ever adds —
 * it never reorders or drops an entry, and is a no-op once `folder-all` is listed.
 *
 * Usage:
 *   node scripts/seed-folder-list-menu.mjs              # dry run (default)
 *   node scripts/seed-folder-list-menu.mjs --apply      # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const TENANTS = ['scs', 'p13', 'kring', 'bka', 'bkg', 'elab', 'okr'];

function menuItem(name, action, url, roleNeeded, icon, label, menuItems = []) {
  return {
    name, action, url, label, icon, roleNeeded, menuItems,
    data: [], description: '', tags: '', isArchived: false,
    index: `n:${name} a:${action} k:${name}`,
    tenants: TENANTS,
  };
}

const DOCS = [
  menuItem('folder-all', 'navigate', '/folder/c-folders', 'contentAdmin', 'folder', '@item.folder-all'),
  menuItem('c-folders', 'context', '', 'contentAdmin', 'help-circle', '', ['folder-add']),
];

/** The shared parent `folder-all` must be listed under to render at all. */
const PARENT = 'cms-menu';
const CHILD = 'folder-all';
/** Put it right after the document list, which is the row it belongs beside. */
const AFTER = 'document-all';

const apply = process.argv.includes('--apply');

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();

  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — tenants: ${TENANTS.join(', ')}\n`);

  for (const data of DOCS) {
    const ref = db.collection('menuItems').doc(data.name);
    if ((await ref.get()).exists) {
      console.log(`  skip    menuItems/${data.name} — already exists`);
      continue;
    }
    if (apply) await ref.create(data);
    console.log(`  ${apply ? 'create ' : 'would  '} menuItems/${data.name} (${data.action}, ${data.roleNeeded})`);
  }

  // ── hang the row under the shared cms-menu parent ────────────────────────────────
  const parentRef = db.collection('menuItems').doc(PARENT);
  const parentSnap = await parentRef.get();
  if (!parentSnap.exists) {
    console.log(`  !! menuItems/${PARENT} does not exist — '${CHILD}' will not render until it is listed somewhere`);
  } else {
    const existing = parentSnap.data().menuItems ?? [];
    if (existing.includes(CHILD)) {
      console.log(`  skip    menuItems/${PARENT}.menuItems — '${CHILD}' already listed`);
    } else {
      // Insert after `document-all` when present, else append. Never reorder what is there.
      const at = existing.indexOf(AFTER);
      const next = at === -1 ? [...existing, CHILD] : [...existing.slice(0, at + 1), CHILD, ...existing.slice(at + 1)];
      if (apply) await parentRef.update({ menuItems: next });
      console.log(`  ${apply ? 'update ' : 'would  '} menuItems/${PARENT}.menuItems += ${CHILD}${at === -1 ? ' (appended)' : ` (after ${AFTER})`}`);
      console.log(`          ${existing.length} → ${next.length} entries`);
    }
  }

  if (!apply) console.log('\nRe-run with --apply to write.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
