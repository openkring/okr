/**
 * MIGRATION — snaps the people sections (`sections`, type `people`) to the look choices of the people block editor:
 * the old look fields (`imgWidth`, `imgRadius`, `background`, `infoPosition`, …) become `size`, `shape`, `fill` and
 * `textPosition`; `excludedPersons` becomes `hiddenKeys`; a legacy `responsibilityId` folds into `responsibilityIds`; fields
 * of a source the section no longer uses are dropped (spec 1.181, design 2026-11-27-people-block-editor §6.3, §8 step 2).
 *
 * NOT TO BE RUN before release A is live everywhere (readers understand `hiddenKeys`, `orderKeys`, the five look fields)
 * and `minVersion` is raised, and without the owner's go-ahead at that time. The installed native builds must be updated
 * by hand first (`version` skill). The trial run is read only and may be repeated at any time.
 *
 * Modes:
 *   --out=<dir>                           trial run (default, READ ONLY): writes plan.json, report-<tenant>.md and
 *                                         summary.md to <dir>. plan.json holds the people sections' properties (names of
 *                                         persons): <dir> must be outside a repository or git-ignored (every file, checked
 *                                         before anything is created or read). The reports hold section key, name and field
 *                                         names only, never values.
 *   --apply --tenant=<id> --plan=<file>   writes the planned sections of one tenant: the whole `properties`, replaced by
 *                                         the planned ones. A section of several tenants (`shared`) is written with any of
 *                                         them: one write serves all.
 *   --undo --tenant=<id> --plan=<file>    puts the stored `properties` back (the exact ones of the trial run, which the apply
 *                                         allowed only for an unchanged section) in sections whose properties still equal what
 *                                         the apply wrote. A section edited since is reported and not touched.
 *
 * WHAT IS LEFT OUT: sections that are not people; sections with nothing to change (the 32 never-saved ones keep their
 * avatar, and only get the `excludedPersons` move); sections the website would draw differently after the change
 * (`website-output-differs`; the 4px → 5px radius is not drawn there); sliders and grids with their own persons per row
 * (≠ 5) or rows (≠ 1), which would be dropped while the website cannot show it (`slider-settings`).
 *
 * SAFETY: each section is written in a transaction that re-reads it: it must be unchanged since the trial run (update
 * time), and planning it again must give the stored patch; otherwise it is skipped and reported. Stale override keys are
 * not dropped (the script has no resolved persons). Before the first write the full documents are saved next to the plan
 * (backup-<mode>-<tenant>-<time>.json; Timestamps become {_seconds, _nanoseconds}). 5 writes per second. The first error
 * stops the run; a second run skips what is done. Each write of a website section sets its «unpublished changes»:
 * republish the websites afterwards.
 * Exit code: 0 = all done, 2 = sections were skipped (counted by reason at the end), 1 = an error.
 *
 * ORDER OF A RUN: a fresh trial run right before --apply, with the same commit; undo with the commit that applied.
 *
 * Usage (bundled first: the repo runs .ts scripts as ESM, where extension-less imports fail):
 *   pnpm exec esbuild scripts/migrate-people-look.ts --bundle --platform=node --packages=external \
 *     --tsconfig=tsconfig.base.json --format=cjs --outfile=dist/scripts/migrate-people-look.cjs
 *   node dist/scripts/migrate-people-look.cjs --out=<dir>
 *   node dist/scripts/migrate-people-look.cjs --apply --tenant=<id> --plan=<dir>/plan.json
 *   node dist/scripts/migrate-people-look.cjs --undo --tenant=<id> --plan=<dir>/plan.json
 *
 * Tests: scripts/migrate-people-look.logic.test.ts (bundled and run with node --test, see its header).
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import {
  applySkip, backupName, buildPlan, entriesOf, exitCodeOf, parseArgs, parsePlan, privateNames, reportName, reportOf, skipSummary, summaryOf, tenantsOf,
  undoSkip, updateTimeOf, type StoredPeopleSection, type WriteEntry,
} from './migrate-people-look.logic';
import { assertPrivate } from './migrate-article-blocks.private';

const PROJECT_ID = 'bkaiser-org';
const COLLECTION = 'sections';
const PAUSE_MS = 200; // 5 writes per second

function write(path: string, content: string, flag: 'w' | 'wx' = 'w'): void {
  // the names of the tenants are known only now
  assertPrivate(dirname(path), [basename(path)]);
  writeFileSync(path, content, { mode: 0o600, flag });
  console.log(`wrote ${path}`);
}

async function trial(db: Firestore, out: string): Promise<void> {
  const dir = resolve(out);
  assertPrivate(dir, privateNames());
  mkdirSync(dir, { recursive: true });
  const snap = await db.collection(COLLECTION).where('type', '==', 'people').get();
  const plan = buildPlan(snap.docs.map((d) => [d.id, d.data() as StoredPeopleSection, d.updateTime]), new Date().toISOString(), PROJECT_ID);
  write(join(dir, 'plan.json'), JSON.stringify(plan, null, 1));
  for (const tenant of tenantsOf(plan)) write(join(dir, reportName(tenant)), reportOf(plan, tenant));
  write(join(dir, 'summary.md'), summaryOf(plan));
  console.log(`\n${summaryOf(plan)}\nTrial run — nothing written to the database.`);
}

/** Why the section must not be written; `undefined` = write it. */
function skipOf(mode: 'apply' | 'undo', entry: WriteEntry, snap: DocumentSnapshot, tenant: string): string | undefined {
  const section = snap.data() as StoredPeopleSection | undefined;
  if (mode === 'undo') return undoSkip(entry, section, tenant);
  return applySkip(entry, section && snap.updateTime ? { section, updateTime: updateTimeOf(snap.updateTime) } : undefined, tenant);
}

async function writeOne(db: Firestore, mode: 'apply' | 'undo', entry: WriteEntry, tenant: string): Promise<string | undefined> {
  const ref = db.collection(COLLECTION).doc(entry.key);
  return db.runTransaction(async (tx) => {
    const skip = skipOf(mode, entry, await tx.get(ref), tenant);
    if (skip) return skip;
    tx.update(ref, { properties: mode === 'apply' ? entry.patch : entry.before });
    return undefined;
  });
}

async function run(db: Firestore, mode: 'apply' | 'undo', tenant: string, planFile: string): Promise<void> {
  const dir = dirname(resolve(planFile));
  assertPrivate(dir, [basename(planFile), ...privateNames(tenant)]);
  const entries = entriesOf(parsePlan(readFileSync(planFile, 'utf8'), PROJECT_ID), tenant);
  const snaps = entries.length > 0 ? await db.getAll(...entries.map((e) => db.collection(COLLECTION).doc(e.key))) : [];
  const skipped: [string, string][] = [];
  const todo: { entry: WriteEntry; snap: DocumentSnapshot }[] = [];
  entries.forEach((entry, i) => {
    const skip = skipOf(mode, entry, snaps[i], tenant);
    if (skip) skipped.push([entry.key, skip]);
    else todo.push({ entry, snap: snaps[i] });
  });
  console.log(`${mode.toUpperCase()} ${tenant}: ${entries.length} planned, ${todo.length} to write, ${skipped.length} skipped`);

  let written = 0;
  try {
    if (todo.length > 0) {
      const backup = todo.map(({ snap }) => ({ key: snap.id, updateTime: snap.updateTime && updateTimeOf(snap.updateTime), data: snap.data() }));
      write(join(dir, backupName(mode, tenant, new Date().toISOString())), JSON.stringify(backup, null, 1), 'wx');
    }
    for (const { entry } of todo) {
      const skip = await writeOne(db, mode, entry, tenant);
      if (skip) skipped.push([entry.key, skip]);
      else {
        written++;
        console.log(`  ${entry.key}${entry.shared ? ` (shared: ${entry.tenants.join(', ')})` : ''}`);
      }
      await sleep(PAUSE_MS);
    }
  } finally {
    for (const [key, reason] of skipped) console.log(`  SKIP ${key}: ${reason}`);
    console.log(`\n${mode === 'apply' ? 'Migrated' : 'Undone'}: ${written}, skipped: ${skipped.length}, of ${entries.length}`);
    if (skipped.length > 0) console.log(skipSummary(skipped));
  }
  process.exitCode = exitCodeOf(skipped);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  if (args.mode === 'trial') await trial(db, args.out);
  else await run(db, args.mode, args.tenant, args.plan);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
