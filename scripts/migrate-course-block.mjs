/**
 * ONE-OFF MIGRATION — `course` becomes a feature block of its own (owner decision 2026-11-19).
 *
 * «Kurse» (`calevent-courses` in the calendar's context menu), «Alle Kurse» (`courses-all` under
 * Buchhaltung), the course list's `c-courses` and the `/course/**` routes moved out of `calevent` and
 * `finance` into the new block `course`. A tenant that runs courses must have `course` in
 * `enabledFeatures`, or its rows and routes disappear with the release that carries the split.
 *
 * Rule: every tenant named in the `tenants[]` of a `courses` document (i.e. one that has ever created a
 * course) gets `course`. Everybody else stays without it — that is the point of the split. Tenants
 * without `enabledFeatures` (legacy «every block») are untouched. Writes use `FieldValue.arrayUnion`,
 * so a concurrent picker save is never overwritten. Idempotent.
 *
 * ORDER (binding): run this with --apply BEFORE the hosting release of any app built from the split.
 * Running it earlier is safe: the old client and old functions ignore an unknown block id.
 *
 * Usage:
 *   node scripts/migrate-course-block.mjs            # dry run: prints what would change
 *   node scripts/migrate-course-block.mjs --apply    # writes
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const { getApps, initializeApp } = rootRequire('firebase-admin/app');
const { FieldValue, getFirestore } = rootRequire('firebase-admin/firestore');

/** Tenants that need `course`: the course tenants whose stored features lack it. Pure, exported for tests. */
export function planCourseBlock(courseTenants, configs) {
  const out = [];
  for (const { id, enabledFeatures } of configs) {
    if (!Array.isArray(enabledFeatures)) continue;          // legacy: reads as every block
    if (!courseTenants.has(id)) continue;
    if (enabledFeatures.includes('course')) continue;
    out.push(id);
  }
  return out.sort();
}

async function main() {
  const apply = process.argv.includes('--apply');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();
  const courseTenants = new Set();
  (await db.collection('courses').get()).forEach((d) => (d.get('tenants') ?? []).forEach((t) => courseTenants.add(t)));
  const configs = (await db.collection('app-config').get()).docs.map((d) => ({ id: d.id, enabledFeatures: d.get('enabledFeatures') }));
  const todo = planCourseBlock(courseTenants, configs);
  console.log(`course tenants: ${[...courseTenants].sort().join(', ') || '—'}`);
  console.log(todo.length ? `add 'course' to: ${todo.join(', ')}` : 'nothing to do');
  if (!apply || todo.length === 0) { if (!apply) console.log('Dry run: nothing written. Add --apply.'); return; }
  for (const id of todo) await db.collection('app-config').doc(id).update({ enabledFeatures: FieldValue.arrayUnion('course') });
  console.log(`done: ${todo.length} tenant(s).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.stack ?? String(e)); process.exit(1); });
}
