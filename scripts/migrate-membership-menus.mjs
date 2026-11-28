/**
 * ONE-TIME DATA FIX (2026-11-28) — two menu changes of the Versand / member lists:
 *
 *  A. «Export …»: the single export rows of the member lists become ONE row that opens the picker of the export kinds
 *     (`MembershipExportModal`, which says what each file contains):
 *
 *       membership-exportraw / -exportsrv / -exportmembers / -exportaddresses / -exportclubdesk  →  membership-export (url export)
 *
 *     in every live `c-membership` and `c-groupmembers` doc (forks included). The new row takes the place of the first
 *     export row; the others are dropped. An old export doc is archived once no live parent lists it any more.
 *
 *  B. the context menu of the Versand overview: `c-mailings` with one row `mailing-new` (url newVersand), for the tenants of
 *     `mailing-all`.
 *
 * The catalogue (`libs/tenant/util/src/lib/feature-blocks.ts`) declares both; this script brings the live docs in line.
 * Every doc id = its name. Nothing is deleted, so this is reversible.
 *
 * ORDER:
 *  1. release the app carrying the `export` / `newVersand` handlers and the `@item.membership-export` / `@item.mailing-new`
 *     labels. An older client has no `export` case (the row does nothing) and shows the raw key. The single export
 *     handlers stay in the app, so the old rows keep working until this script ran.
 *  2. run `scripts/migrate-comm-center-menu.mjs --apply` (still pending): it replaces the old «Versand erstellen» row
 *     (`membership-sendemail`) by `comm-center` — the row the member lists showed twice.
 *  3. run this script.
 *
 * Usage:
 *   node scripts/migrate-membership-menus.mjs              # dry run (default)
 *   node scripts/migrate-membership-menus.mjs --apply      # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const EXPORT_PARENTS = ['c-membership', 'c-groupmembers'];
const OLD_EXPORTS = [
  'membership-exportraw', 'membership-exportsrv', 'membership-exportmembers', 'membership-exportaddresses', 'membership-exportclubdesk',
];
const EXPORT_NAME = 'membership-export';
const MAILING_PARENT = 'c-mailings';
const MAILING_NEW = 'mailing-new';
const MAILING_SIBLING = 'mailing-all';

const common = { data: [], description: '', tags: '', isArchived: false };
const callDoc = (name, url, roleNeeded, icon, label) => ({
  ...common, name, url, action: 'call', roleNeeded, icon, label, menuItems: [], index: `n:${name} a:call k:${name}`,
});
const EXPORT_DOC = callDoc(EXPORT_NAME, 'export', 'registered', 'download', `@item.${EXPORT_NAME}`);
const MAILING_NEW_DOC = callDoc(MAILING_NEW, 'newVersand', 'memberAdmin', 'add-circle', `@item.${MAILING_NEW}`);
const MAILING_PARENT_DOC = {
  ...common, name: MAILING_PARENT, url: '', action: 'context', roleNeeded: 'memberAdmin', icon: 'help-circle', label: '',
  menuItems: [MAILING_NEW], index: `n:${MAILING_PARENT} a:context k:${MAILING_PARENT}`,
};

const apply = process.argv.includes('--apply');
const verb = (done) => (apply ? done.padEnd(7) : 'would  ');

/** creates the doc, or adds the tenants it lacks */
async function ensureDoc(col, data, tenants) {
  const ref = col.doc(data.name);
  const snap = await ref.get();
  if (!snap.exists) {
    if (apply) await ref.set({ ...data, tenants });
    console.log(`  ${verb('create')} menuItems/${data.name} [${tenants.join(',')}]`);
    return;
  }
  const have = snap.data().tenants ?? [];
  const missing = tenants.filter((t) => !have.includes(t));
  if (snap.data().isArchived) console.warn(`  WARN    menuItems/${data.name} exists but is archived — left as it is`);
  if (missing.length === 0) return console.log(`  skip    menuItems/${data.name} — exists with all tenants`);
  if (apply) await ref.update({ tenants: FieldValue.arrayUnion(...missing) });
  console.log(`  ${verb('extend')} menuItems/${data.name}.tenants += [${missing.join(',')}]`);
}

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();
  const col = db.collection('menuItems');
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}\n`);

  // ── A. «Export …» ────────────────────────────────────────────────────────────────
  const parents = (await col.where('name', 'in', EXPORT_PARENTS).get()).docs.filter((d) => !d.data().isArchived);
  const exportTenants = [...new Set(parents.flatMap((d) => d.data().tenants ?? []))].sort();
  console.log(`  found   ${parents.length} live ${EXPORT_PARENTS.join('/')} docs, tenants [${exportTenants.join(',')}]`);
  await ensureDoc(col, EXPORT_DOC, exportTenants);

  for (const parent of parents) {
    const existing = parent.data().menuItems ?? [];
    const next = [];
    for (const row of existing) {
      const mapped = OLD_EXPORTS.includes(row) ? EXPORT_NAME : row;
      if (mapped === EXPORT_NAME && next.includes(EXPORT_NAME)) continue;
      next.push(mapped);
    }
    if (JSON.stringify(next) === JSON.stringify(existing)) {
      console.log(`  skip    menuItems/${parent.id} (${parent.data().name}) — no single export rows`);
      continue;
    }
    if (apply) await parent.ref.update({ menuItems: next });
    console.log(`  ${verb('update')} menuItems/${parent.id} (${parent.data().name}).menuItems → [${next.join(', ')}]`);
  }

  // an old export doc goes once no live parent lists it (after the writes above; a dry run counts them as done)
  const rewritten = new Set(parents.map((p) => p.id));
  for (const name of OLD_EXPORTS) {
    const snap = await col.doc(name).get();
    if (!snap.exists || snap.data().isArchived) continue;
    const users = (await col.where('menuItems', 'array-contains', name).get()).docs
      .filter((d) => !d.data().isArchived && !(rewritten.has(d.id)));
    if (users.length > 0) {
      console.log(`  keep    menuItems/${name} — still listed by ${users.map((d) => d.id).join(', ')}`);
      continue;
    }
    if (apply) await snap.ref.update({ isArchived: true });
    console.log(`  ${verb('archive')} menuItems/${name}`);
  }

  // ── B. the context menu of the Versand overview ──────────────────────────────────
  const sibling = await col.doc(MAILING_SIBLING).get();
  const mailingTenants = sibling.exists ? [...(sibling.data().tenants ?? [])].sort() : [];
  if (mailingTenants.length === 0) {
    console.warn(`  WARN    menuItems/${MAILING_SIBLING} not found or without tenants — ${MAILING_PARENT} not seeded`);
  } else {
    await ensureDoc(col, MAILING_NEW_DOC, mailingTenants);
    await ensureDoc(col, MAILING_PARENT_DOC, mailingTenants);
  }

  if (!apply) console.log('\nRe-run with --apply to write.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
