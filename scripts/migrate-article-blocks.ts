/**
 * MIGRATION — gives the articles (`sections`, type `article`) their content as blocks: `properties.blocks`, and
 * `properties.cover` where a single image was not shown (spec 1.173, design 2026-11-23-article-blocks §8.1, §11).
 *
 * NOT TO BE RUN before the gate of design §12 (every app reads blocks, `minVersion` raised, project 2 released) and
 * without the owner's go-ahead at that time. The trial run is read only and may be repeated at any time.
 *
 * Modes:
 *   --out=<dir>                           trial run (default, READ ONLY): writes plan.json, report-<tenant>.md and
 *                                         summary.md to <dir>. plan.json holds article contents: <dir> must be outside
 *                                         a repository or git-ignored (every file, checked before anything is
 *                                         created or read). The reports hold section key, name and title only.
 *   --apply --tenant=<id> --plan=<file>   writes the planned articles of one tenant. An article of several tenants
 *                                         (`shared` in the plan and the reports) is written with any of them: one
 *                                         write serves all.
 *   --undo --tenant=<id> --plan=<file>    removes exactly the two fields from articles whose blocks still equal the plan.
 *                                         An article that was edited since is reported and not touched.
 *
 * WHAT IS LEFT OUT (stays an old article, works like today): journal articles; articles with blocks; a legacy
 * `properties.image` without `images`; articles that are not drawn the same there and back; articles whose website
 * section, home layout or news differ after the conversion.
 *
 * SAFETY: only the two fields are written, each article in a transaction that re-reads it: it must be unchanged since the
 * trial run (update time), still have no blocks, and planning it again must give the stored patch; otherwise it is
 * skipped and reported. Before the first write the full documents are saved next to the plan
 * (backup-<mode>-<tenant>-<time>.json; Timestamps become {_seconds, _nanoseconds}). 5 writes per second. The first
 * error stops the run; a second run skips what is done. Each write of a website section sets its «unpublished changes».
 * Exit code: 0 = all done, 2 = articles were skipped (counted by reason at the end; a second run skips the ones that are
 * done, has-blocks), 1 = an error.
 *
 * ORDER OF A RUN:
 *   1. A fresh trial run right before --apply, with the same commit: an article that was saved since the trial run is
 *      skipped (changed-since-trial), and a plan of an older commit may be planned differently now (patch-differs).
 *   2. Undo with the commit that applied: undo plans the article again and compares (edited, old-fields-changed).
 *   3. A section form that was opened before the migration and saved after it writes the old article back, without blocks.
 *      So run the trial again afterwards: such articles are listed as articles to migrate; apply them with that new plan.
 *
 * Usage (bundled first: the repo runs .ts scripts as ESM, where extension-less imports fail):
 *   pnpm exec esbuild scripts/migrate-article-blocks.ts --bundle --platform=node --packages=external \
 *     --tsconfig=tsconfig.base.json --format=cjs --outfile=dist/scripts/migrate-article-blocks.cjs
 *   node dist/scripts/migrate-article-blocks.cjs --out=<dir>
 *   node dist/scripts/migrate-article-blocks.cjs --apply --tenant=<id> --plan=<dir>/plan.json
 *   node dist/scripts/migrate-article-blocks.cjs --undo --tenant=<id> --plan=<dir>/plan.json
 *
 * OTHER WRITERS (spec 1.175 §12): new articles get blocks from the group and chat stores and the editor once the gate is open
 * (ArticleBlocksGate.mayWrite). Scripts that write the old fields stop at an article with blocks
 * (scripts/lib/block-article-guard.mjs); a new script that writes them must call that guard too.
 *
 * Tests: libs/shared/models (article-migration.util.spec.ts) and scripts/migrate-article-blocks.logic.test.ts
 * (logic and the guard of the directory).
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, FieldValue, getFirestore, type DocumentSnapshot, type Firestore } from 'firebase-admin/firestore';
import { articleApplySkip, articleUndoSkip } from '@okr/shared-models';
import {
  backupName, buildPlan, entriesOf, exitCodeOf, parseArgs, parsePlan, privateNames, reportName, reportOf, skipSummary, summaryOf, tenantsOf, updateTimeOf,
  type MigrateEntry, type StoredSection,
} from './migrate-article-blocks.logic';
import { assertPrivate } from './migrate-article-blocks.private';

const PROJECT_ID = 'bkaiser-org';
const COLLECTION = 'sections';
const PAUSE_MS = 200; // 5 writes per second
const BLOCKS = new FieldPath('properties', 'blocks');
const COVER = new FieldPath('properties', 'cover');

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
  const snap = await db.collection(COLLECTION).where('type', '==', 'article').get();
  const plan = buildPlan(snap.docs.map((d) => [d.id, d.data() as StoredSection, d.updateTime]), new Date().toISOString(), PROJECT_ID);
  write(join(dir, 'plan.json'), JSON.stringify(plan, null, 1));
  for (const tenant of tenantsOf(plan)) write(join(dir, reportName(tenant)), reportOf(plan, tenant));
  write(join(dir, 'summary.md'), summaryOf(plan));
  console.log(`\n${summaryOf(plan)}\nTrial run — nothing written to the database.`);
}

/** Why the article must not be written; `undefined` = write it. */
function skipOf(mode: 'apply' | 'undo', entry: MigrateEntry, snap: DocumentSnapshot, tenant: string): string | undefined {
  const section = snap.data() as StoredSection | undefined;
  if (mode === 'undo') return articleUndoSkip(entry.patch, section, tenant);
  return articleApplySkip(entry, section && snap.updateTime ? { section, updateTime: updateTimeOf(snap.updateTime) } : undefined, tenant);
}

async function writeOne(db: Firestore, mode: 'apply' | 'undo', entry: MigrateEntry, tenant: string): Promise<string | undefined> {
  const ref = db.collection(COLLECTION).doc(entry.key);
  return db.runTransaction(async (tx) => {
    const skip = skipOf(mode, entry, await tx.get(ref), tenant);
    if (skip) return skip;
    const { blocks, cover } = entry.patch;
    if (mode === 'undo') tx.update(ref, BLOCKS, FieldValue.delete(), COVER, FieldValue.delete());
    else if (cover) tx.update(ref, BLOCKS, blocks, COVER, cover);
    else tx.update(ref, BLOCKS, blocks);
    return undefined;
  });
}

async function run(db: Firestore, mode: 'apply' | 'undo', tenant: string, planFile: string): Promise<void> {
  const dir = dirname(resolve(planFile));
  assertPrivate(dir, [basename(planFile), ...privateNames(tenant)]);
  const entries = entriesOf(parsePlan(readFileSync(planFile, 'utf8'), PROJECT_ID), tenant);
  const snaps = entries.length > 0 ? await db.getAll(...entries.map((e) => db.collection(COLLECTION).doc(e.key))) : [];
  const skipped: [string, string][] = [];
  const todo: { entry: MigrateEntry; snap: DocumentSnapshot }[] = [];
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
      else written++;
      if (!skip) console.log(`  ${entry.key} ${entry.shape}${entry.shared ? ` (shared: ${entry.tenants.join(', ')})` : ''}`);
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
