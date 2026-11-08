/**
 * ONE-TIME DATA FIX — replaces the two «Versand erstellen» call rows by ONE shared `comm-center`
 * row. The comm center (spec 1.145) is more than sending emails, so the row, its label and its
 * action are renamed:
 *
 *   person-send-email     (url sendEmailToList, icon email)  ─┐
 *   membership-sendemail  (url sendEmailToList, icon email)  ─┴→ comm-center (url commCenter, icon send)
 *
 * The catalogue (`libs/tenant/util/src/lib/feature-blocks.ts`) declares `comm-center` under
 * `c-persons`, `c-membership` and `c-groupmembers`; this script brings the live docs in line.
 *
 * The org list gets the same row (orgs are comm-center recipients too, key `org.<okey>`).
 *
 * Four writes:
 *  1. create `menuItems/comm-center` (doc id = name), `tenants[]` = the union of the tenants of
 *     every non-archived old doc (forks included). Skipped when it exists; then only missing
 *     tenants are added.
 *  2. every `menuItems` doc whose `menuItems[]` lists an old name: the old name is replaced IN
 *     PLACE by `comm-center` (position kept; a second old name in the same parent is dropped,
 *     so the row never shows twice).
 *  3. every live `c-orgs` doc (forks included) gets `comm-center` after `org-copy-emails` (or at
 *     the end), and its tenants join `comm-center.tenants`.
 *  4. every old doc is archived (`isArchived: true`) — never deleted, so this is reversible.
 *
 * ORDER: deploy the functions first (getMailingRecipients / sendMailing / onMailing learn org
 * recipients), then release the app carrying the `commCenter` handler, then run this.
 * Why the app: release the app carrying the `commCenter` handler and the `@item.comm-center` label
 * FIRST. An older client has no `commCenter` case (the row does nothing) and shows the raw key.
 * `assertMenuLabelsLive` is not wired here; check the label in the live bundle by hand.
 *
 * Usage:
 *   node scripts/migrate-comm-center-menu.mjs              # dry run (default)
 *   node scripts/migrate-comm-center-menu.mjs --apply      # perform the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const OLD_NAMES = ['person-send-email', 'membership-sendemail'];
const ORG_PARENT = 'c-orgs';
const ORG_AFTER = 'org-copy-emails';
const NEW_NAME = 'comm-center';
const NEW_DOC = {
  name: NEW_NAME,
  url: 'commCenter',
  action: 'call',
  roleNeeded: 'memberAdmin',
  icon: 'send',
  label: '@item.comm-center',
  menuItems: [],
  data: [], description: '', tags: '', isArchived: false,
  index: `n:${NEW_NAME} a:call k:${NEW_NAME}`,
};

const apply = process.argv.includes('--apply');

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();
  const col = db.collection('menuItems');
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}\n`);

  // ── collect the old docs ─────────────────────────────────────────────────────────
  const oldDocs = (await col.where('name', 'in', OLD_NAMES).get()).docs
    .filter((d) => !d.data().isArchived);
  const orgParents = (await col.where('name', '==', ORG_PARENT).get()).docs.filter((d) => !d.data().isArchived);
  const tenants = [...new Set([...oldDocs, ...orgParents].flatMap((d) => d.data().tenants ?? []))].sort();
  console.log(`  found   ${oldDocs.length} live old docs, ${orgParents.length} ${ORG_PARENT} docs, tenants [${tenants.join(',')}]`);

  // ── 1. the shared comm-center doc ────────────────────────────────────────────────
  const newRef = col.doc(NEW_NAME);
  const newSnap = await newRef.get();
  if (!newSnap.exists) {
    if (apply) await newRef.set({ ...NEW_DOC, tenants });
    console.log(`  ${apply ? 'create ' : 'would  '} menuItems/${NEW_NAME} [${tenants.join(',')}]`);
  } else {
    const have = newSnap.data().tenants ?? [];
    const missing = tenants.filter((t) => !have.includes(t));
    if (missing.length === 0) console.log(`  skip    menuItems/${NEW_NAME} — exists with all tenants`);
    else {
      if (apply) await newRef.update({ tenants: FieldValue.arrayUnion(...missing) });
      console.log(`  ${apply ? 'extend ' : 'would  '} menuItems/${NEW_NAME}.tenants += [${missing.join(',')}]`);
    }
  }

  // ── 2. repoint the parents ───────────────────────────────────────────────────────
  for (const oldName of OLD_NAMES) {
    const parents = await col.where('menuItems', 'array-contains', oldName).get();
    for (const parent of parents.docs) {
      const existing = parent.data().menuItems ?? [];
      const next = [];
      for (const row of existing) {
        const mapped = OLD_NAMES.includes(row) ? NEW_NAME : row;
        if (mapped === NEW_NAME && next.includes(NEW_NAME)) continue;
        next.push(mapped);
      }
      if (JSON.stringify(next) === JSON.stringify(existing)) continue;
      if (apply) await parent.ref.update({ menuItems: next });
      console.log(`  ${apply ? 'update ' : 'would  '} menuItems/${parent.id}.menuItems: ${oldName} → ${NEW_NAME}`);
    }
  }

  // ── 3. the org list ──────────────────────────────────────────────────────────────
  for (const parent of orgParents) {
    const existing = parent.data().menuItems ?? [];
    if (existing.includes(NEW_NAME)) {
      console.log(`  skip    menuItems/${parent.id}.menuItems — already lists ${NEW_NAME}`);
      continue;
    }
    const at = existing.indexOf(ORG_AFTER);
    const next = at < 0 ? [...existing, NEW_NAME] : [...existing.slice(0, at + 1), NEW_NAME, ...existing.slice(at + 1)];
    if (apply) await parent.ref.update({ menuItems: next });
    console.log(`  ${apply ? 'update ' : 'would  '} menuItems/${parent.id}.menuItems += ${NEW_NAME}`);
  }

  // ── 4. archive the old docs ──────────────────────────────────────────────────────
  for (const doc of oldDocs) {
    if (apply) await doc.ref.update({ isArchived: true });
    console.log(`  ${apply ? 'archive' : 'would  '} menuItems/${doc.id} (${doc.data().name})`);
  }

  if (!apply) console.log('\nRe-run with --apply to write.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
