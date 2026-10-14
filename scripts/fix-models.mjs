/**
 * Bulk-fix the documents of ONE collection (spec 1.101 phase 1) — replaces the former «Daten-Korrektur»
 * button of the AOC data page. THIS CAN CHANGE MANY DOCUMENTS: always read the dry run first.
 *
 * Usage:
 *   node scripts/fix-models.mjs --collection <name> [--max <n>]            # dry run (default)
 *   node scripts/fix-models.mjs --collection <name> [--max <n>] --apply    # write
 *
 * Dry run prints `[FIX] <collection>/<id> — <fields changed>` per changed doc and nothing for unchanged ones.
 * --apply writes ONLY the changed fields via update() (never set()), in batches of 400.
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { planFix } from './fix-models.logic.mjs';

// ---------------------------------------------------------------------------------------------
// CONFIGURATION — edit these three for the migration at hand, then run a dry run.
// Field specs: s:string n:number b:boolean m:map a:array; defaults accept `=value` (e.g. n:priority=1).
const DEFAULTS = []; // set missing/null fields, e.g. ['n:priority=1', 'a:tags']
const TYPE_SPEC = []; // coerce types, e.g. ['n:amount', 's:name']
/**
 * One-off hook: receives a copy of the doc (with `okey` = doc id), returns a patch of top-level fields.
 * Example (the former groups fix): merge `admin`/`mainContact` into `admins`, set tags ''.
 * Deleting a field is not supported here (patch values are written as given).
 */
const CUSTOM = undefined; // (doc) => ({ tags: '' })
// ---------------------------------------------------------------------------------------------

const BATCH_SIZE = 400;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const valueOf = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const collection = valueOf('--collection');
const maxRaw = valueOf('--max');
const max = maxRaw === undefined ? undefined : Number(maxRaw);
const known = new Set(['--collection', '--max', '--apply', collection, maxRaw]);
if (!collection || args.some((a) => !known.has(a)) || (max !== undefined && !(max > 0))) {
  console.error('Usage: node scripts/fix-models.mjs --collection <name> [--max <n>] [--apply]');
  process.exit(1);
}

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();
console.log(apply ? 'APPLY MODE\n' : 'DRY RUN (no writes) — pass --apply to write.\n');
console.log(`collection=${collection} max=${max ?? 'all'} defaults=${JSON.stringify(DEFAULTS)} typeSpec=${JSON.stringify(TYPE_SPEC)} custom=${CUSTOM ? 'yes' : 'no'}\n`);

const snaps = (await db.collection(collection).get()).docs;
const changes = [];
let processed = 0;
for (const snap of snaps) {
  if (max !== undefined && processed >= max) break;
  processed++;
  const { changed, patch } = planFix({ okey: snap.id, ...snap.data() }, { defaults: DEFAULTS, typeSpec: TYPE_SPEC, custom: CUSTOM });
  if (!changed) continue;
  changes.push({ ref: snap.ref, patch });
  console.log(`[FIX] ${collection}/${snap.id} — ${Object.keys(patch).join(', ')}`);
}
console.log(`\n${changes.length} of ${processed} processed document(s) need a fix (${snaps.length} in collection).`);
if (!apply) process.exit(0);

for (let i = 0; i < changes.length; i += BATCH_SIZE) {
  const batch = db.batch();
  for (const c of changes.slice(i, i + BATCH_SIZE)) batch.update(c.ref, c.patch);
  await batch.commit();
  console.log(`wrote ${Math.min(i + BATCH_SIZE, changes.length)} / ${changes.length}`);
}
console.log('\nDone. Re-run without --apply: nothing must be listed.');
