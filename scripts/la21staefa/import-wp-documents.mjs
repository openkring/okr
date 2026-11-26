#!/usr/bin/env node
/**
 * The PDFs the la21staefa content links on the old WordPress site (www.la21staefa.ch/wp-content/uploads/…) move into
 * Storage as documents (owner, 2026-11-26), so the links keep working when the old site goes.
 *
 *   node scripts/la21staefa/import-wp-documents.mjs            # dry run: lists files, documents and sections
 *   node scripts/la21staefa/import-wp-documents.mjs --write
 *
 * Per linked file:
 * - uploads it to `tenant/la21staefa/document/<file name>` with a download token (kept when the object exists);
 * - creates `docs/la21staefa_wp_<slug>` (DocumentModel) in the folder «Website-Dokumente» (`folders/la21staefa_website`),
 *   title from the file name, creation date = the upload month of the old site, SHA-256 hash;
 * - rewrites every link to it in the la21staefa sections to the document's download url.
 * Create-only and idempotent: an existing document is reused (its url), a section without old links is untouched.
 * HELD lists files that are NOT moved (personal data, owner decision pending); their links stay as they are.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const T = 'la21staefa';
const BUCKET = 'bkaiser-org.appspot.com';
const FOLDER = `${T}_website`;
const WP = /https?:\/\/(?:www\.)?la21staefa\.ch\/wp-content\/uploads\/(\d{4})\/(\d{2})\/([^"'\s<>\\)?#]+)/g;

/** files that stay on the old site for now: the participant list of the KreisWERK event (names and mail addresses) */
export const HELD = ['2024/10/E-Mail-Liste-2.pdf'];

/** the old site's file link → { year, month, file, rel } (rel = 'yyyy/mm/file') */
export function parseWpUrl(url) {
  WP.lastIndex = 0;
  const m = WP.exec(url);
  return m ? { year: m[1], month: m[2], file: decodeURIComponent(m[3]), rel: `${m[1]}/${m[2]}/${decodeURIComponent(m[3])}` } : undefined;
}

/** a readable title from the file name: «Jahresbericht-2024-Bau-Energie.pdf» → «Jahresbericht 2024 Bau Energie» */
export function titleOf(file) {
  return file.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** the document's okey: deterministic, so a second run finds it */
export function docKeyOf(file) {
  return `${T}_wp_${file.replace(/\.[a-z0-9]+$/i, '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export const storagePathOf = (file) => `tenant/${T}/document/${file}`;
export const downloadUrl = (path, token) =>
  `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;

export function documentOf({ file, year, month, path, url, size, hash, mimeType }) {
  const title = titleOf(file);
  const date = `${year}${month}01`;
  return {
    tenants: [T], isArchived: false, tags: '', folderKeys: [FOLDER],
    index: `n:${title} h:${hash} m:${mimeType} f:${FOLDER}`,
    fullPath: path, description: '', title, altText: '', type: 'info', source: 'storage', credit: '', url, mimeType, size,
    authorKey: '', authorName: '', dateOfDocCreation: date, dateOfDocLastUpdate: date, locationKey: '', hash,
    priorVersionKey: '', version: '1.0', renderings: [],
    notes: `von www.la21staefa.ch übernommen (wp-content/uploads/${year}/${month}/${file}, 2026-11-26)`,
  };
}

/** `value` with every old link of a moved file replaced by its new url (`urls`: rel → url); deep copy */
export function rewriteDeep(value, urls) {
  if (typeof value === 'string') {
    return value.replace(WP, (whole, y, m, f) => urls.get(`${y}/${m}/${decodeURIComponent(f)}`) ?? whole);
  }
  if (Array.isArray(value)) return value.map((v) => rewriteDeep(v, urls));
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteDeep(v, urls)]));
  }
  return value;
}

const FOLDER_DOC = {
  name: 'Website-Dokumente', title: 'Website-Dokumente', description: 'Dokumente, die auf der Website verlinkt sind (von www.la21staefa.ch übernommen)',
  parents: [], membersMayUpload: false, ownerKey: '', coverDocumentKey: '', matrixRoomId: '', tags: '', tenants: [T], isArchived: false,
  index: 'n:Website-Dokumente',
};

async function main() {
  const write = process.argv.includes('--write');
  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  const { getStorage } = rootRequire('firebase-admin/storage');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org', storageBucket: BUCKET });
  const db = getFirestore();
  const bucket = getStorage().bucket(BUCKET);
  const say = (verb, what) => console.log(`${(write ? verb : `would ${verb}`).padEnd(18)} ${what}`);

  // 1. the linked files
  const sections = (await db.collection('sections').where('tenants', 'array-contains', T).get()).docs;
  const files = new Map(); // rel → parsed
  for (const s of sections) {
    for (const m of JSON.stringify(s.data()).matchAll(WP)) {
      const p = parseWpUrl(m[0]);
      if (p && !HELD.includes(p.rel)) files.set(p.rel, p);
    }
  }
  const byName = new Map();
  for (const p of files.values()) {
    if (byName.has(p.file)) throw new Error(`two files named ${p.file}: ${byName.get(p.file)} and ${p.rel} — give one its own name first`);
    byName.set(p.file, p.rel);
  }
  console.log(`${files.size} linked file(s), ${HELD.length} held back: ${HELD.join(', ')}\n`);

  // 2. folder
  const folderRef = db.doc(`folders/${FOLDER}`);
  if ((await folderRef.get()).exists) console.log(`exists, kept       folders/${FOLDER}`);
  else { say('create', `folders/${FOLDER} «${FOLDER_DOC.name}»`); if (write) await folderRef.create(FOLDER_DOC); }

  // 3. upload + document per file
  const urls = new Map();
  const failed = [];
  for (const p of [...files.values()].sort((a, b) => a.rel.localeCompare(b.rel))) {
    const key = docKeyOf(p.file);
    const docRef = db.doc(`docs/${key}`);
    const existing = (await docRef.get()).data();
    if (existing) { urls.set(p.rel, existing.url); console.log(`exists, kept       docs/${key}`); continue; }
    const res = await fetch(`https://www.la21staefa.ch/wp-content/uploads/${p.rel.split('/').map(encodeURIComponent).join('/')}`,
      { headers: { 'User-Agent': 'okr-website-import/1.0' } });
    if (!res.ok) { failed.push(`${p.rel} (HTTP ${res.status})`); continue; }
    const body = Buffer.from(await res.arrayBuffer());
    const mimeType = (res.headers.get('content-type') ?? 'application/pdf').split(';')[0];
    const path = storagePathOf(p.file);
    const object = bucket.file(path);
    let token;
    const [exists] = await object.exists();
    if (exists) {
      const [meta] = await object.getMetadata();
      token = String(meta.metadata?.firebaseStorageDownloadTokens ?? '').split(',')[0] || undefined;
      if (!token) throw new Error(`${path} exists without a download token — check it by hand`);
      if (Number(meta.size) !== body.length) throw new Error(`${path} exists with another size (${meta.size} ≠ ${body.length}) — a different file of the same name?`);
    }
    token ??= randomUUID();
    const hash = createHash('sha256').update(body).digest('hex');
    const url = downloadUrl(path, token);
    say(exists ? 'reuse object' : 'upload', `${path} (${Math.round(body.length / 1024)} KB)`);
    say('create', `docs/${key} «${titleOf(p.file)}»`);
    if (write) {
      if (!exists) await object.save(body, { contentType: mimeType, resumable: false, metadata: { metadata: { firebaseStorageDownloadTokens: token } } });
      await docRef.create(documentOf({ ...p, path, url, size: body.length, hash, mimeType }));
    }
    urls.set(p.rel, url);
  }

  // 4. links in the sections
  let changed = 0;
  for (const s of sections) {
    const data = s.data();
    const patch = {};
    for (const field of ['content', 'properties']) {
      if (data[field] === undefined) continue;
      const next = rewriteDeep(data[field], urls);
      if (JSON.stringify(next) !== JSON.stringify(data[field])) patch[field] = next;
    }
    if (!Object.keys(patch).length) continue;
    changed++;
    const n = new Set([...JSON.stringify(data).matchAll(WP)].map((m) => parseWpUrl(m[0]).rel).filter((r) => urls.has(r))).size;
    say('update', `sections/${s.id}: ${n} file link(s)`);
    if (write) await s.ref.update(patch);
  }
  console.log(`\n${urls.size} document(s), ${changed} section(s) ${write ? 'updated' : 'to update'}`);
  if (failed.length) console.log(`NOT moved (old site did not deliver):\n  ${failed.join('\n  ')}`);
  if (!write) console.log('Dry run — nothing written. Pass --write.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.stack ?? String(e)); process.exit(1); });
}
