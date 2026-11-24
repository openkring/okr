/**
 * CLEAN-UP before the article migration (spec 1.173 §11, §13a): empties `properties.images` of articles whose images are
 * nothing but placeholders (no url, no text, no link). The migration leaves such articles out; without the placeholders
 * they convert as text. Nothing else is written.
 *
 *   --out=<dir>                   dry run (default, READ ONLY): writes empty-images.json (keys and update times) to <dir>
 *   --apply --plan=<file>         empties the images of the listed articles
 *   --undo --backup=<file>        puts the images back, only where they are still empty and the article has no blocks
 *
 * NOT TO BE RUN with --apply without the owner's go-ahead. Each article is written in a transaction that re-reads it: it
 * must be unchanged since the dry run and still cleanable. The full documents are saved next to the plan before the first
 * write. 5 writes per second. Exit code: 0 = all done, 2 = articles were skipped, 1 = an error.
 *
 * ORDER: clean → fresh trial run of migrate-article-blocks → its --apply. To go back: undo of the migration, then this undo.
 *
 * Usage:
 *   pnpm exec esbuild scripts/clean-empty-article-images.ts --bundle --platform=node --packages=external \
 *     --tsconfig=tsconfig.base.json --format=cjs --outfile=dist/scripts/clean-empty-article-images.cjs
 *   node dist/scripts/clean-empty-article-images.cjs --out=<dir>
 *
 * Tests: scripts/clean-empty-article-images.logic.test.ts
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { isCleanable } from './clean-empty-article-images.logic';
import { exitCodeOf, updateTimeOf, type StoredSection } from './migrate-article-blocks.logic';
import { assertPrivate } from './migrate-article-blocks.private';

const PROJECT_ID = 'bkaiser-org';
const COLLECTION = 'sections';
const PAUSE_MS = 200; // 5 writes per second
const IMAGES = new FieldPath('properties', 'images');

interface Planned { key: string; updateTime: string }
interface Saved { key: string; data: StoredSection }

const imagesOf = (data: StoredSection | undefined): unknown => (data?.properties as { images?: unknown } | undefined)?.images;

function write(path: string, content: string, flag: 'w' | 'wx' = 'w'): void {
  assertPrivate(dirname(path), [basename(path)]);
  writeFileSync(path, content, { mode: 0o600, flag });
  console.log(`wrote ${path}`);
}

async function dryRun(db: Firestore, out: string): Promise<void> {
  const dir = resolve(out);
  assertPrivate(dir, ['empty-images.json']);
  mkdirSync(dir, { recursive: true });
  const snap = await db.collection(COLLECTION).where('type', '==', 'article').get();
  const planned: Planned[] = snap.docs.filter((d) => isCleanable(d.id, d.data() as StoredSection)).map((d) => ({ key: d.id, updateTime: updateTimeOf(d.updateTime) }));
  write(join(dir, 'empty-images.json'), JSON.stringify({ projectId: PROJECT_ID, articles: planned }, null, 1));
  console.log(`${snap.size} articles, ${planned.length} with nothing but empty images. Dry run — nothing written to the database.`);
}

/** Runs the writes one by one; `one` answers why an article was skipped. */
async function each<T extends { key: string }>(items: T[], one: (item: T) => Promise<string | undefined>): Promise<void> {
  const skipped: [string, string][] = [];
  let written = 0;
  try {
    for (const item of items) {
      const skip = await one(item);
      if (skip) skipped.push([item.key, skip]);
      else written++;
      await sleep(PAUSE_MS);
    }
  } finally {
    for (const [key, reason] of skipped) console.log(`  SKIP ${key}: ${reason}`);
    console.log(`Written: ${written}, skipped: ${skipped.length}, of ${items.length}`);
  }
  process.exitCode = exitCodeOf(skipped);
}

async function apply(db: Firestore, planFile: string): Promise<void> {
  const plan = JSON.parse(readFileSync(planFile, 'utf8')) as { projectId?: string; articles?: Planned[] };
  if (plan.projectId !== PROJECT_ID || !Array.isArray(plan.articles)) throw new Error('this is not a plan of this script');
  if (plan.articles.length === 0) return console.log('nothing to do');
  const dir = dirname(resolve(planFile));
  const snaps = await db.getAll(...plan.articles.map((a) => db.collection(COLLECTION).doc(a.key)));
  const backup = snaps.filter((s) => s.exists).map((s) => ({ key: s.id, data: s.data() }));
  write(join(dir, `backup-images-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(backup, null, 1), 'wx');
  await each(plan.articles, ({ key, updateTime }) => db.runTransaction(async (tx) => {
    const ref = db.collection(COLLECTION).doc(key);
    const snap = await tx.get(ref);
    if (!snap.exists || !snap.updateTime) return 'missing';
    if (updateTimeOf(snap.updateTime) !== updateTime) return 'changed-since-dry-run';
    if (!isCleanable(key, snap.data() as StoredSection)) return 'not-cleanable';
    tx.update(ref, IMAGES, []);
    return undefined;
  }));
}

async function undo(db: Firestore, backupFile: string): Promise<void> {
  const saved = JSON.parse(readFileSync(backupFile, 'utf8')) as Saved[];
  await each(saved, ({ key, data }) => db.runTransaction(async (tx) => {
    const ref = db.collection(COLLECTION).doc(key);
    const live = (await tx.get(ref)).data() as StoredSection | undefined;
    if (!live) return 'missing';
    if ((live.properties as { blocks?: unknown }).blocks !== undefined) return 'has-blocks';
    const images = imagesOf(live);
    if (!Array.isArray(images) || images.length > 0) return 'has-images';
    tx.update(ref, IMAGES, imagesOf(data));
    return undefined;
  }));
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const value = (name: string): string | undefined => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  const known = argv.every((a) => a === '--apply' || a === '--undo' || /^--(out|plan|backup)=.+$/.test(a));
  const [out, plan, backup] = [value('out'), value('plan'), value('backup')];
  const wanted = [argv.length === 1 && out, argv.length === 2 && argv.includes('--apply') && plan, argv.length === 2 && argv.includes('--undo') && backup];
  if (!known || !wanted.some(Boolean)) throw new Error('give --out=<dir>, or --apply --plan=<file>, or --undo --backup=<file>');
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  const db = getFirestore();
  if (out) await dryRun(db, out);
  else if (plan) await apply(db, plan);
  else if (backup) await undo(db, backup);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
