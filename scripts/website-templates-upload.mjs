/**
 * Uploads a tenant website's Handlebars template set (spec 1.153 §6.4) and points the site at it.
 *
 *   node scripts/website-templates-upload.mjs <tenant> [--dry-run]
 *
 * Source:  apps/<tenant>-website/templates/**   (website.json, layout.hbs, partials/, sections/, pages/)
 *          website.json is read from templates/website.json, else apps/<tenant>-website/website.json
 * Target:  gs://<default bucket>/websites/<siteId>/templates/<version>/…   (siteId = website.json.siteId)
 *          version = YYYYMMDD-HHmm-<git short sha>
 * Then:    sets websites/<siteId>.templateVersion = <version>
 *
 * Refuses when websites/<siteId> does not exist. --dry-run lists the files and the version and writes
 * nothing; the Firestore existence check is skipped (with a note) when no credentials are available, so
 * a dry run works offline.
 *
 * Requires for a real run: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS),
 * and GCLOUD_PROJECT / GOOGLE_CLOUD_PROJECT or an ADC quota project. Writes to production — review the
 * dry run first.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tenant = args.find((a) => !a.startsWith('--'));

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!tenant || !/^[a-z0-9-]+$/.test(tenant)) fail('Usage: node scripts/website-templates-upload.mjs <tenant> [--dry-run]');

const appDir = join(root, 'apps', `${tenant}-website`);
const templatesDir = join(appDir, 'templates');
if (!existsSync(templatesDir)) fail(`No template folder: ${relative(root, templatesDir)}`);

/** All files below dir, as paths relative to dir with forward slashes. */
function walk(dir, base = dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full, base) : [relative(base, full).split('\\').join('/')];
  });
}

const manifestPath = [join(templatesDir, 'website.json'), join(appDir, 'website.json')].find(existsSync);
if (!manifestPath) fail(`website.json not found in ${relative(root, templatesDir)} or ${relative(root, appDir)}`);
let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (e) {
  fail(`website.json is not valid JSON: ${e.message}`);
}
const siteId = manifest.siteId;
if (typeof siteId !== 'string' || !/^[\w-]+$/.test(siteId)) fail('website.json.siteId is missing or invalid');
if (!existsSync(join(templatesDir, 'layout.hbs'))) fail('layout.hbs is missing');

// website.json → target root; everything else under templates/ keeps its relative path.
const uploads = walk(templatesDir)
  .filter((f) => f === 'layout.hbs' || /^(partials|sections|pages)\/[\w-]+\.hbs$/.test(f))
  .map((f) => ({ target: f, source: join(templatesDir, f) }));
uploads.push({ target: 'website.json', source: manifestPath });
const ignored = walk(templatesDir).filter((f) => f !== 'website.json' && !uploads.some((u) => u.target === f));

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const version = `${stamp}-${sha}`;
const prefix = `websites/${siteId}/templates/${version}/`;

console.log(`${dryRun ? 'DRY RUN' : 'UPLOAD'} ${tenant} → gs://<default bucket>/${prefix}`);
for (const u of uploads) console.log(`  ${u.target}`);
if (ignored.length) console.log(`  (ignored, not a template file: ${ignored.join(', ')})`);

async function main() {
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ storageBucket: process.env.STORAGE_BUCKET ?? 'bkaiser-org.appspot.com' });

  let exists;
  try {
    exists = (await getFirestore().collection('websites').doc(siteId).get()).exists;
  } catch (e) {
    if (!dryRun) throw e;
    console.log(`\nNote: websites/${siteId} could not be checked offline (${e.code ?? e.message}). Skipped for the dry run.`);
  }
  if (exists === false) fail(`\nRefusing: no websites/${siteId} document. Create the website in the app first.`);
  if (dryRun) {
    console.log(`\nWould set websites/${siteId}.templateVersion = ${version}. Nothing written.`);
    return;
  }

  const { getStorage } = await import('firebase-admin/storage');
  const bucket = getStorage().bucket();
  for (const u of uploads) {
    await bucket.upload(u.source, {
      destination: prefix + u.target,
      contentType: u.target.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8',
    });
  }
  await getFirestore().collection('websites').doc(siteId).update({ templateVersion: version });
  console.log(`\nUploaded ${uploads.length} files; websites/${siteId}.templateVersion = ${version}`);
}

main().catch((e) => fail(e.stack ?? String(e)));
