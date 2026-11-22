#!/usr/bin/env node
/**
 * Brings the LA21 newsletter articles into the la21staefa news blog (spec 1.165).
 *
 *   node scripts/la21staefa/import-news.mjs --articles <articles.json> [--write]
 *
 * <articles.json> is the hand-edited extraction of the Mailchimp newsletters (one entry per newsletter topic, the
 * member salutations, tracking links and the recurring «Mach aktiv mit» blocks dropped). Not part of the repository:
 *   [{ slug, date: 'YYYYMMDD', tags: ['<group name>' | 'Verein LA21'], title, subTitle, html, images: [{ url, alt }] }]
 *
 *  - Every entry becomes a published, public article section `sections/la21staefa_<slug>` (name = slug, the url id
 *    of the website's news-artikel page) and is appended to the blog page `pages/news_la21staefa`, which the app's
 *    news page and the website's /news (publicApi) read.
 *  - The category is the project group: `tags` holds the group's name, one of the tenant's section tags
 *    (tags/la21staefa_section, seeded by seed-content.mjs). An unknown tag stops the run.
 *  - The subtitle line carries the date and the group, so the app's article shows the category too.
 *  - Pictures are copied to Storage (tenant/la21staefa/section/<key>/<file>) and shown via imgix.
 *  - Create-only: an existing section is reported and left alone. Dry run without --write.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileNameOf, imageLayoutOf } from './import-pages.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const T = 'la21staefa';
const BUCKET = 'bkaiser-org.appspot.com';
const NEWS_PAGE = `pages/news_${T}`;

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const IMAGE = { actionUrl: '', altText: '', credit: '', documentKey: '', label: '', overlay: '', type: 0, url: '' };
const IMAGE_STYLE = { imgIxParams: '', width: '100%', height: 'auto', sizes: '(max-width: 786px) 50vw, 100vw', border: '', borderRadius: '', fill: true, hasPriority: false, action: 0, zoomFactor: 2 };

/** 'YYYYMMDD' → '16. Februar 2026' */
export function germanDate(storeDate) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(storeDate));
  if (!m) throw new Error(`invalid date ${storeDate}`);
  return `${Number(m[3])}. ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** the document id of an article */
export const keyOf = (entry) => `${T}_${entry.slug}`;

/** the storage path of an article picture */
export const imagePathOf = (key, url) => `tenant/${T}/section/${key}/${fileNameOf(url)}`;

/** the tags of an entry that the tenant does not define (an unknown tag hides from the filters and blocks editing) */
export function unknownTags(entry, knownTags) {
  return (entry.tags ?? []).filter((t) => !knownTags.includes(t));
}

/** the article section of one newsletter entry */
export function newsArticleOf(entry) {
  const key = keyOf(entry);
  if (!/^\d{8}news_[a-z0-9_]+$/.test(entry.slug)) throw new Error(`invalid slug ${entry.slug}`);
  if (!entry.title || entry.title.length > 100) throw new Error(`${entry.slug}: title missing or longer than 100`);
  if (!entry.tags?.length) throw new Error(`${entry.slug}: no category`);
  const images = (entry.images ?? []).map((i) => ({ ...IMAGE, url: imagePathOf(key, i.url), altText: String(i.alt ?? '').slice(0, 200) }));
  const layout = imageLayoutOf(images.length);
  const subTitle = [germanDate(entry.date), entry.tags.join(', '), entry.subTitle].filter(Boolean).join(' · ');
  const position = images.length === 0 ? 0 : images.length === 1 ? 4 : 1; // none · right · top (ViewPosition)
  return {
    name: entry.slug, type: 'article', state: 'published', roleNeeded: 'public', colSize: '12', color: 0,
    title: entry.title, subTitle: subTitle.length > 100 ? subTitle.slice(0, subTitle.lastIndexOf(' · ')) : subTitle,
    notes: 'aus dem LA21 Newsletter übernommen (1.165)', tags: entry.tags.join(', '), isArchived: false, tenants: [T],
    content: { htmlContent: entry.html, colSize: 4, position },
    properties: { images, imageStyle: IMAGE_STYLE, datePublished: entry.date, ...(layout ? { imageLayout: layout } : {}) },
    index: `n:${entry.slug} a:article k:${key}`,
  };
}

async function main() {
  const write = process.argv.includes('--write');
  const file = process.argv[process.argv.indexOf('--articles') + 1];
  if (!process.argv.includes('--articles') || !file) throw new Error('usage: import-news.mjs --articles <articles.json> [--write]');
  const entries = JSON.parse(readFileSync(file, 'utf8'));

  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore, FieldValue } = rootRequire('firebase-admin/firestore');
  const { getStorage } = rootRequire('firebase-admin/storage');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org', storageBucket: BUCKET });
  const db = getFirestore();
  const bucket = getStorage().bucket(BUCKET);

  const page = (await db.doc(NEWS_PAGE).get()).data();
  if (!page) throw new Error(`${NEWS_PAGE} is missing — run seed-website.mjs first`);
  const knownTags = String((await db.doc(`tags/${T}_section`).get()).data()?.tags ?? '').split(',').map((t) => t.trim());
  const bad = entries.flatMap((e) => unknownTags(e, knownTags).map((t) => `${e.slug}: «${t}»`));
  if (bad.length) throw new Error(`unknown categories (tags/${T}_section): ${bad.join('; ')}`);

  const added = [];
  for (const entry of entries) {
    const key = keyOf(entry);
    const article = newsArticleOf(entry);
    const ref = db.doc(`sections/${key}`);
    if ((await ref.get()).exists) { console.log(`exists, kept  sections/${key}`); continue; }
    for (const img of entry.images ?? []) {
      const path = imagePathOf(key, img.url);
      const [exists] = await bucket.file(path).exists();
      if (exists) continue;
      const res = await fetch(img.url, { method: write ? 'GET' : 'HEAD' });
      if (!res.ok) throw new Error(`picture missing (HTTP ${res.status}): ${img.url}`);
      console.log(`${write ? 'uploading    ' : 'would upload '} ${path}`);
      if (write) await bucket.file(path).save(Buffer.from(await res.arrayBuffer()), { contentType: res.headers.get('content-type') ?? undefined, resumable: false });
    }
    console.log(`${write ? 'creating     ' : 'would create '} sections/${key} [${article.tags}] ${article.title}`);
    if (write) await ref.create(article);
    added.push(key);
  }
  const missing = entries.map(keyOf).filter((k) => !(page.sections ?? []).includes(k));
  console.log(`${write ? 'linking      ' : 'would link   '} ${missing.length} articles into ${NEWS_PAGE}`);
  if (write && missing.length) await db.doc(NEWS_PAGE).update({ sections: FieldValue.arrayUnion(...missing) });
  console.log(`${added.length} new, ${entries.length - added.length} kept${write ? '' : ' (dry run — add --write)'}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
