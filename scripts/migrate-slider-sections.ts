/**
 * MIGRATION — turns every slider section (`sections`, type `slider`) into an article with one gallery block in the carousel
 * layout, under the same document id (spec 1.182 §6). The conversion is `sliderToArticle`, the one the section editor uses
 * since phase A.
 *
 * NOT TO BE RUN before phase A is released and without the owner's go-ahead at that time. The trial run is read only and
 * may be repeated at any time.
 *
 * Modes:
 *   --out=<dir>                           trial run (default, READ ONLY): writes plan.json, report-<tenant>.md and
 *                                         summary.md to <dir>. plan.json holds slider contents: <dir> must be outside a
 *                                         repository or git-ignored. The reports hold section key, name and title only.
 *   --apply --tenant=<id> --plan=<file>   converts the planned sliders of one tenant. A shared slider is written with any
 *                                         of its tenants: one write serves all.
 *   --undo --tenant=<id> --plan=<file>    turns migrated articles back into their sliders (type and the original
 *                                         properties), only where the article was not edited since.
 *
 * LEFT OUT (stays a slider, drawn by okr-slider-section as today): sliders without images; sliders whose public output
 * differs after the conversion where they are shown: a page of a live website (section, home layout), an accordion, a
 * news page. A slider is mapped as a classic article and the article as a free one; the free one must carry the same keys
 * and one gallery in the carousel layout with the classic images (publicDifferences).
 *
 * SAFETY: only `type` and `properties` are written, each slider in a transaction that re-reads it: still a slider,
 * unchanged since the trial run (update time), and converting it again gives the stored patch; otherwise it is skipped
 * and reported. Before the first write the full documents are saved next to the plan (backup-<mode>-<tenant>-<time>.json).
 * 5 writes per second. The first error stops the run; a second run skips what is done (not-a-slider).
 * Exit code: 0 = all done, 2 = sliders were skipped, 1 = an error.
 *
 * Usage (bundled first: the repo runs .ts scripts as ESM, where extension-less imports fail):
 *   pnpm exec esbuild scripts/migrate-slider-sections.ts --bundle --platform=node --packages=external \
 *     --tsconfig=tsconfig.base.json --format=cjs --outfile=dist/scripts/migrate-slider-sections.cjs
 *   node dist/scripts/migrate-slider-sections.cjs --out=<dir>
 *   node dist/scripts/migrate-slider-sections.cjs --apply --tenant=<id> --plan=<dir>/plan.json
 *   node dist/scripts/migrate-slider-sections.cjs --undo --tenant=<id> --plan=<dir>/plan.json
 *
 * Tests: scripts/migrate-slider-sections.logic.test.ts (node --test, bundled the same way) and slider-article.util.spec.ts.
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
  undoSkip, updateTimeOf, usageFinder, type MigrateEntry, type StoredSlider,
} from './migrate-slider-sections.logic';
import { assertPrivate } from './migrate-article-blocks.private';

const PROJECT_ID = 'bkaiser-org';
const COLLECTION = 'sections';
const PAUSE_MS = 200;

function write(path: string, content: string, flag: 'w' | 'wx' = 'w'): void {
  assertPrivate(dirname(path), [basename(path)]);
  writeFileSync(path, content, { mode: 0o600, flag });
  console.log(`wrote ${path}`);
}

async function trial(db: Firestore, out: string): Promise<void> {
  const dir = resolve(out);
  assertPrivate(dir, privateNames());
  mkdirSync(dir, { recursive: true });
  const [snap, pages, websites, accordions] = await Promise.all([
    db.collection(COLLECTION).where('type', '==', 'slider').get(),
    db.collection('pages').get(),
    db.collection('websites').get(),
    db.collection(COLLECTION).where('type', '==', 'accordion').get(),
  ]);
  const usageOf = usageFinder(pages.docs.map((d) => ({ key: d.id, ...d.data() })), websites.docs.map((d) => d.data()), accordions.docs.map((d) => d.data()));
  const plan = buildPlan(snap.docs.map((d) => [d.id, d.data() as StoredSlider, d.updateTime]), new Date().toISOString(), PROJECT_ID, usageOf);
  write(join(dir, 'plan.json'), JSON.stringify(plan, null, 1));
  for (const tenant of tenantsOf(plan)) write(join(dir, reportName(tenant)), reportOf(plan, tenant));
  write(join(dir, 'summary.md'), summaryOf(plan));
  console.log(`\n${summaryOf(plan)}\nTrial run — nothing written to the database.`);
}

function skipOf(mode: 'apply' | 'undo', entry: MigrateEntry, snap: DocumentSnapshot, tenant: string): string | undefined {
  const section = snap.data() as StoredSlider | undefined;
  if (mode === 'undo') return undoSkip(entry, section, tenant);
  return applySkip(entry, section && snap.updateTime ? { section, updateTime: updateTimeOf(snap.updateTime) } : undefined, tenant);
}

async function writeOne(db: Firestore, mode: 'apply' | 'undo', entry: MigrateEntry, tenant: string): Promise<string | undefined> {
  const ref = db.collection(COLLECTION).doc(entry.key);
  return db.runTransaction(async (tx) => {
    const skip = skipOf(mode, entry, await tx.get(ref), tenant);
    if (skip) return skip;
    if (mode === 'undo') tx.update(ref, { type: 'slider', properties: entry.original });
    else tx.update(ref, { type: entry.patch.type, properties: entry.patch.properties });
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
