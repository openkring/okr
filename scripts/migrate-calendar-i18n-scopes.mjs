/**
 * ONE-TIME MIGRATION — live documents that still name the i18n scopes of before bec6eaa7e.
 *
 * That commit moved libs/calevent and libs/content/meeting into libs/calendar. The i18n prefixes
 * follow the asset path, so the old scopes no longer exist and Hosting answers them with
 * index.html. Two kinds of documents carry a scope as data and did not move with the code:
 *
 *  - `menuItems`: `label` / `labelAlt` (`@content/meeting/feature.*`) — BKA-3, BKG-1, OKR-2, SCS-4C;
 *  - `categories`: `i18n` (`@calevent/feature`) — SCS-EA/EB/EC, BKA-7, ELAB-7.
 *
 * Every target key must resolve in HEAD's bundle, or the document is left alone and reported.
 *
 * Usage:
 *   node scripts/migrate-calendar-i18n-scopes.mjs           # dry run (default)
 *   node scripts/migrate-calendar-i18n-scopes.mjs --apply   # write
 * Requires: gcloud auth application-default login.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { categoryItemKeys, keyResolves } from './lib/i18n-labels.mjs';

const MOVED = [['@calevent/', '@calendar/calevent/'], ['@content/meeting/', '@calendar/meeting/']];
const rewrite = (value) => {
  if (typeof value !== 'string') return null;
  const hit = MOVED.find(([from]) => value.startsWith(from));
  return hit ? hit[1] + value.slice(hit[0].length) : null;
};

const apply = process.argv.includes('--apply');

async function main() {
  if (!getApps().length) initializeApp();
  const db = getFirestore();
  const writes = [];
  const blocked = [];

  for (const doc of (await db.collection('menuItems').get()).docs) {
    const patch = {};
    for (const field of ['label', 'labelAlt']) {
      const next = rewrite(doc.data()[field]);
      if (next === null) continue;
      if (keyResolves(next)) patch[field] = next;
      else blocked.push(`menuItems/${doc.id}.${field}: ${next}`);
    }
    if (Object.keys(patch).length) writes.push({ ref: doc.ref, patch });
  }

  for (const doc of (await db.collection('categories').get()).docs) {
    const next = rewrite(doc.data().i18n);
    if (next === null) continue;
    const moved = { ...doc.data(), i18n: next };
    const missing = categoryItemKeys(moved).filter((key) => !keyResolves(key));
    if (missing.length) blocked.push(`categories/${doc.id}: ${missing.join(', ')}`);
    else writes.push({ ref: doc.ref, patch: { i18n: next } });
  }

  for (const { ref, patch } of writes) {
    console.log(`  ${apply ? 'write' : 'would write'}  ${ref.path}  ${JSON.stringify(patch)}`);
    if (apply) await ref.update(patch);
  }
  for (const line of blocked) console.log(`  BLOCKED  ${line}`);
  console.log(`\n${writes.length} document(s) ${apply ? 'written' : 'to write'}, ${blocked.length} blocked.`);
  if (blocked.length) process.exit(1);
}

main().catch((err) => {
  console.error(`migrate-calendar-i18n-scopes: ${err.message}`);
  process.exit(2);
});
