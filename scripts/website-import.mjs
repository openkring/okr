/**
 * Imports a tenant website seed into Firestore (+ images into Storage) (spec 1.153 §9).
 *
 *   node scripts/website-import.mjs <tenant> [--replace] [--dry-run] [--seed=<file>]
 *
 * Source: apps/<tenant>-website/content/seed.json (format: scripts/lib/website-seed.schema.json,
 * checked by scripts/lib/website-seed.mjs before anything else).
 * Writes:  websites/<site.okey>, pages/<key>, sections/<id>   (okey is the doc id, stripped from the data),
 *          images → gs://<default bucket>/<image.path> from content/<image.file>.
 * Refuses to touch an existing site, or an existing page/section id, unless --replace (which overwrites
 * those docs with set(); documents not in the seed are left alone).
 * --dry-run prints the planned writes and writes nothing; the existence check is skipped with a note when
 * no credentials are available. PRODUCTION DATA: review the dry run first.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

import { classifyObjects, validateSeed } from './lib/website-seed.mjs';
import { getDb, loadLocalTemplates, parseArgs, PROJECT_ID, requireTenant } from './lib/website-tooling.mjs';

/** The writes a seed plans, in order: [{ kind, collection?, id?, bucketPath?, file?, data? }]. */
export function planWrites(seed, contentDir) {
  const tenants = seed.site.tenants?.length ? seed.site.tenants : [seed.site.okey];
  const strip = ({ okey: _okey, ...rest }) => rest;
  const writes = [{ kind: 'doc', collection: 'websites', id: seed.site.okey, data: { isArchived: false, templateVersion: '', ...strip(seed.site), tenants } }];
  for (const [id, page] of Object.entries(seed.pages)) writes.push({ kind: 'doc', collection: 'pages', id, data: { isArchived: false, ...strip(page), tenants } });
  for (const [id, section] of Object.entries(seed.sections)) writes.push({ kind: 'doc', collection: 'sections', id, data: { isArchived: false, ...strip(section), tenants } });
  for (const img of seed.images ?? []) writes.push({ kind: 'image', bucketPath: img.path, file: resolve(contentDir, img.file) });
  return writes;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  const { tenant, flags, values } = parseArgs(process.argv.slice(2));
  requireTenant(tenant, 'Usage: node scripts/website-import.mjs <tenant> [--replace] [--dry-run] [--seed=<file>]');
  const dryRun = flags.has('--dry-run');
  const replace = flags.has('--replace');
  const contentDir = resolve(join(dirname(new URL(import.meta.url).pathname), '..', 'apps', `${tenant}-website`, 'content'));
  // --seed=<file>: another seed (e.g. a fixture); its folder is the base of the image files
  const seedFile = values.seed ? resolve(values.seed) : join(contentDir, 'seed.json');
  if (!existsSync(seedFile)) fail(`No seed: ${seedFile}`);
  return run(seedFile, values.seed ? dirname(seedFile) : contentDir, { dryRun, replace, tenant });
}

/** Separate from main() so a fixture seed can be imported (dry run) by path. */
export async function run(seedFile, contentDir, { dryRun, replace, tenant }) {
  const seed = JSON.parse(readFileSync(seedFile, 'utf8'));
  const errors = validateSeed(seed, { tenant, siteId: loadLocalTemplates(tenant).manifest.siteId });
  if (errors.length) fail(`Invalid seed ${seedFile}:\n  ${errors.join('\n  ')}`);
  const writes = planWrites(seed, contentDir);
  for (const w of writes.filter((x) => x.kind === 'image')) {
    if (!w.file.startsWith(contentDir + sep) || !existsSync(w.file)) fail(`Image file missing or outside content/: ${w.file}`);
  }

  console.log(`${dryRun ? 'DRY RUN' : 'IMPORT'} ${seed.site.okey}${replace ? ' (--replace)' : ''} → project ${PROJECT_ID}`);
  for (const w of writes) {
    if (w.kind === 'doc') console.log(`  set ${w.collection}/${w.id}  (${Object.keys(w.data).length} fields)`);
    else console.log(`  upload ${w.bucketPath}  ← ${w.file.replace(contentDir + sep, 'content/')}`);
  }

  let existing = [];
  try {
    const db = await getDb();
    const docs = writes.filter((w) => w.kind === 'doc');
    const snaps = await db.getAll(...docs.map((w) => db.collection(w.collection).doc(w.id)));
    existing = snaps.filter((s) => s.exists).map((s) => s.ref.path);
  } catch (e) {
    if (!dryRun) throw e;
    console.log(`\nNote: existing documents could not be checked offline (${e.code ?? e.message}). Skipped for the dry run.`);
  }
  const images = writes.filter((x) => x.kind === 'image');
  let bucket;
  let objects = { create: images.map((w) => w.bucketPath), overwrite: [] };
  if (images.length) {
    try {
      const { getStorage } = await import('firebase-admin/storage');
      bucket = getStorage().bucket(process.env.STORAGE_BUCKET ?? 'bkaiser-org.appspot.com');
      objects = await classifyObjects(objects.create, async (path) => (await bucket.file(path).exists())[0]);
    } catch (e) {
      if (!dryRun) throw e;
      console.log(`\nNote: existing Storage objects could not be checked offline (${e.code ?? e.message}). Skipped for the dry run.`);
    }
    console.log(`\nImages: ${objects.create.length} would be created${objects.create.length ? ' (' + objects.create.join(', ') + ')' : ''}, ${objects.overwrite.length} would be overwritten${objects.overwrite.length ? ' (' + objects.overwrite.join(', ') + ')' : ''}`);
  }
  if (objects.overwrite.length && !replace) fail(`\nRefusing: Storage objects already exist: ${objects.overwrite.join(', ')}. Use --replace to overwrite them.`);
  if (existing.length && !replace) fail(`\nRefusing: already exist: ${existing.join(', ')}. Use --replace to overwrite them.`);
  if (existing.length) console.log(`\nWould overwrite: ${existing.join(', ')}`);
  if (dryRun) {
    console.log('\nNothing written.');
    return;
  }

  const db = await getDb();
  for (const w of writes.filter((x) => x.kind === 'doc')) await db.collection(w.collection).doc(w.id).set(w.data);
  if (images.length) {
    for (const w of images) await bucket.upload(w.file, { destination: w.bucketPath });
  }
  console.log(`\nWrote ${writes.length - images.length} documents and ${images.length} images.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => fail(e.stack ?? String(e)));
}
