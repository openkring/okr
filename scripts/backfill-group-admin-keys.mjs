/**
 * ONE-TIME BACKFILL — sets `adminKeys` (exact-case keys of `admins[]`, duplicates and empty keys
 * dropped, order kept) on every `groups` doc where it differs from the current value.
 *
 * WHY: firestore.rules cannot iterate `admins[]` (a list of maps), so it tests the flat
 * `adminKeys` with `in`. The `adminKeys` handler of the `onGroupDocWritten` trigger (formerly the
 * own trigger `onGroupWritten`) keeps it current from now on; this script covers groups written
 * before the trigger was deployed. Keep the logic in step with
 * apps/functions/src/group/group-admin-keys.ts.
 *
 * Idempotent; only `adminKeys` is written (update(), never set()). Dry run by default.
 *
 * Usage:
 *   node scripts/backfill-group-admin-keys.mjs           # dry run
 *   node scripts/backfill-group-admin-keys.mjs --apply   # write
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');
const BATCH_SIZE = 400;

function groupAdminKeys(admins) {
  const keys = [];
  for (const admin of admins ?? []) {
    const key = admin?.key;
    if (typeof key === 'string' && key !== '' && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

function needsUpdate(before, next) {
  const current = before ?? [];
  return current.length !== next.length || current.some((key, i) => key !== next[i]);
}

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();

  const snapshot = await db.collection('groups').get();
  console.log(`${apply ? 'APPLY' : 'DRY RUN'} — groups.adminKeys · ${snapshot.size} groups in the collection\n`);

  const todo = [];
  let already = 0;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const next = groupAdminKeys(data.admins);
    if (needsUpdate(data.adminKeys, next)) todo.push({ ref: doc.ref, next });
    else already++;
  }
  console.log(`  to change: ${todo.length} · already in sync: ${already}`);

  if (apply) {
    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = db.batch();
      todo.slice(i, i + BATCH_SIZE).forEach(({ ref, next }) => batch.update(ref, { adminKeys: next }));
      await batch.commit();
      console.log(`  committed ${Math.min(i + BATCH_SIZE, todo.length)}/${todo.length}`);
    }
    console.log(`\nchanged: ${todo.length}`);
  } else {
    console.log('\nRe-run with --apply to write.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
