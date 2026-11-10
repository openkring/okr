/**
 * READ-ONLY check: lists scs sections where the plain German field (title,
 * subTitle, content.htmlContent) differs from a seeded properties.*I18n.de value.
 * Feature 1.151 makes the plain field win for German in the public API.
 *
 * Run with:  node scripts/check-section-i18n-de.mjs
 * Requires:  gcloud auth application-default login  (or GOOGLE_APPLICATION_CREDENTIALS)
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({ projectId: 'bkaiser-org' });
}
const db = getFirestore();

const TENANT = 'scs';
const FIELDS = [
  { name: 'title', plain: (s) => s.title, de: (s) => s.properties?.titleI18n?.de },
  { name: 'subTitle', plain: (s) => s.subTitle, de: (s) => s.properties?.subTitleI18n?.de },
  { name: 'content', plain: (s) => s.content?.htmlContent, de: (s) => s.properties?.contentI18n?.de },
];

const norm = (v) => (typeof v === 'string' ? v.trim() : '');
const cut = (v) => {
  const t = norm(v).replace(/\s+/g, ' ');
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
};

const pagesSnap = await db.collection('pages').where('tenants', 'array-contains', TENANT).get();
const pagesBySection = new Map();
for (const p of pagesSnap.docs) {
  for (const ref of p.data().sections ?? []) {
    const id = String(ref).replace('@TID@', TENANT);
    if (!pagesBySection.has(id)) pagesBySection.set(id, []);
    pagesBySection.get(id).push(p.id);
  }
}

const secSnap = await db.collection('sections').where('tenants', 'array-contains', TENANT).get();
let hits = 0;
for (const doc of secSnap.docs) {
  const s = doc.data();
  if (s.isArchived === true) continue;
  for (const f of FIELDS) {
    const de = norm(f.de(s));
    if (!de) continue;
    const plain = norm(f.plain(s));
    if (plain === de) continue;
    hits++;
    const pages = (pagesBySection.get(doc.id) ?? []).join(',') || '-';
    console.log(`${doc.id} | pages: ${pages} | ${f.name} | plain: ${cut(plain)} | de: ${cut(de)}`);
  }
}
console.log(`\n${hits} conflict(s) in ${secSnap.size} scs section doc(s).`);
process.exit(0);
