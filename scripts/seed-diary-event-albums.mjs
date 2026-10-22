#!/usr/bin/env node
/**
 * Seeds event albums into `diaryAlbums` (spec 1.114 §2.4): one per
 * `archive/collections/events/*.md` note (slug = file basename, title = frontmatter `title`)
 * and, ONLY with `--with-orphans`, one per slug found in the tenant's `diaries.events[]`
 * without a note (title = slug). The orphan slug list is always printed.
 *
 * SAFETY
 *   events[] values that are not slug-shaped are skipped and only counted.
 *   --dry-run is the DEFAULT. `--write` must be explicit.
 *   `--tenant=<id>` (validated against `app-config/<id>`) and `--author=<uid>` are mandatory:
 *   both are written into the document id, where they cannot be corrected in place.
 *   Albums are created with `.create()`, never `set()`; existing ids are skipped.
 *   Never prints titles or diary text, only counts and slugs (slugs are not personal data).
 *
 * Id and fields mirror libs/content/diary/util/src/lib/diary-album.util.ts (diaryAlbumId) and
 * libs/shared/models/src/lib/diary-album.model.ts. Keep identical.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? '';
const isWrite = args.includes('--write');
const tenantId = flag('tenant');
const authorKey = flag('author');
const withOrphans = args.includes('--with-orphans');
const archive = flag('archive') || process.env.DIARY_ARCHIVE || '';

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}
if (!tenantId) fail('--tenant=<id> is mandatory.');
if (!authorKey) fail('--author=<uid> is mandatory.');
if (!archive) fail('--archive=<path> or $DIARY_ARCHIVE is mandatory.');

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
const db = getFirestore();

const DiaryAlbumCollection = 'diaryAlbums';
const DiaryCollection = 'diaries';
const APP_CONFIG = 'app-config';

const config = await db.collection(APP_CONFIG).doc(tenantId).get();
if (!config.exists) fail(`Tenant '${tenantId}' has no ${APP_CONFIG} document.`);

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
function frontmatterField(text, key) {
  const front = FRONTMATTER.exec(text)?.[1] ?? '';
  return new RegExp(`^${key}:\\s*(.+)$`, 'm').exec(front)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
}

/** Mirror of diaryAlbumId(tenantId, authorKey, 'event', slug). */
const albumId = (slug) => `${tenantId}__${authorKey}__event__${slug}`;

const eventsDir = path.join(archive, 'collections', 'events');
try {
  readdirSync(eventsDir);
} catch {
  fail(`Events directory not found: ${eventsDir} (check --archive).`);
}
const notes = new Map(); // slug -> title
for (const file of readdirSync(eventsDir).filter((f) => f.endsWith('.md'))) {
  const slug = file.replace(/\.md$/, '');
  notes.set(slug, frontmatterField(readFileSync(path.join(eventsDir, file), 'utf8'), 'title') || slug);
}

const diaries = await db.collection(DiaryCollection).where('tenants', 'array-contains', tenantId).get();
const used = new Set();
for (const doc of diaries.docs) for (const e of doc.data().events ?? []) if (e) used.add(e);
// A slug is a camelCase archive id. Anything else in events[] (e.g. a Jass result line that
// leaked in, containing names) is not a slug: it is skipped and only counted, never printed.
const SLUG = /^[A-Za-z0-9_-]+$/;
const unfit = [...used].filter((s) => !SLUG.test(s)).length;
const orphans = [...used].filter((s) => SLUG.test(s) && !notes.has(s)).sort();

const entries = [...notes].map(([slug, title]) => ({ slug, title }))
  .concat(withOrphans ? orphans.map((slug) => ({ slug, title: slug })) : []);

function buildAlbum({ slug, title }) {
  return {
    tenants: [tenantId], isArchived: false, authorKey, kind: 'event',
    title, slug, notes: '',
    index: title.toLowerCase(),
  };
}

let existing = 0;
let created = 0;
for (const entry of entries) {
  const ref = db.collection(DiaryAlbumCollection).doc(albumId(entry.slug));
  if (!isWrite) {
    if ((await ref.get()).exists) existing++;
    continue;
  }
  try {
    await ref.create(buildAlbum(entry));
    created++;
  } catch (error) {
    if (error?.code === 6) { existing++; continue; } // ALREADY_EXISTS: never overwrite
    throw error;
  }
}

console.log(`tenant=${tenantId} author=${authorKey} diariesScanned=${diaries.size}`);
console.log(`notes=${notes.size} orphanSlugs=${orphans.length} (${withOrphans ? 'included' : 'NOT included, pass --with-orphans'}) nonSlugValuesSkipped=${unfit} wouldCreate=${entries.length - existing} existing=${existing}`
  + (isWrite ? ` created=${created}` : ' (dry run, nothing written)'));
console.log(`orphan slugs: ${orphans.join(' ') || '(none)'}`);
process.exit(0);
