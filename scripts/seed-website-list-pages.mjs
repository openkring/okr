#!/usr/bin/env node
/**
 * Makes «News» and «Termine» of a website editable pages (spec 1.153): the links /news and /termine of the
 * navigation become page entries, each with a CMS page that carries today's heading (title, subtitle, intro).
 * The list, the filters and the address stay: they come from the template of the fixed page.
 *
 *   node scripts/seed-website-list-pages.mjs <scs|la21staefa>            # dry run (default)
 *   node scripts/seed-website-list-pages.mjs <scs|la21staefa> --apply    # write (production data!)
 *
 * ORDER, else publishing is refused with slugDuplicate: 1. deploy publishWebsite, 2. pnpm website:deploy <tenant>
 * (uploads website.json with `editable`), 3. this script, 4. «Veröffentlichen». --apply refuses when the live
 * template set is not editable yet (step 2); step 1 cannot be checked from here.
 * Documents are created, never overwritten; the navigation is written in one transaction.
 *
 * Requires: gcloud auth application-default login.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { LIST_PAGES, planListPages } from './lib/website-list-pages.mjs';

const siteId = process.argv[2];
const apply = process.argv.includes('--apply');
if (!LIST_PAGES[siteId]) {
  console.error(`Usage: node scripts/seed-website-list-pages.mjs <${Object.keys(LIST_PAGES).join('|')}> [--apply]`);
  process.exit(1);
}
if (!getApps().length) initializeApp({ projectId: 'bkaiser-org', storageBucket: 'bkaiser-org.appspot.com' });
const db = getFirestore();
const siteRef = db.collection('websites').doc(siteId);

/** Slugs the live template set does not let a page entry use. */
async function notEditable(site, slugs) {
  const file = getStorage().bucket().file(`websites/${siteId}/templates/${site.templateVersion}/website.json`);
  const manifest = JSON.parse((await file.download())[0].toString('utf8'));
  return slugs.filter((slug) => !manifest.fixedPages.some((f) => f.slug === slug && f.editable === true));
}

const snap = await siteRef.get();
if (!snap.exists) throw new Error(`websites/${siteId} is missing`);
const plan = planListPages(siteId, snap.data());
for (const line of plan.lines) console.log(line);
for (const [k, p] of Object.entries(plan.pages)) console.log(`create pages/${k}`, JSON.stringify(p, null, 2));
for (const [k, s] of Object.entries(plan.sections)) console.log(`create sections/${k}`, JSON.stringify(s, null, 2));

if (Object.keys(plan.pages).length === 0) {
  console.log('Nothing to do.');
} else if (!apply) {
  console.log('\nDry run. Add --apply to write.');
} else {
  const missing = await notEditable(snap.data(), Object.keys(plan.pages).map((k) => LIST_PAGES[siteId].find((p) => p.pageKey === k).slug));
  if (missing.length) throw new Error(`The live templates are not editable yet for: ${missing.join(', ')}. Run pnpm website:deploy ${siteId} first.`);
  await db.runTransaction(async (tx) => {
    const fresh = await tx.get(siteRef);
    const p = planListPages(siteId, fresh.data());
    for (const [k, doc] of Object.entries(p.pages)) tx.create(db.collection('pages').doc(k), doc);
    for (const [k, doc] of Object.entries(p.sections)) tx.create(db.collection('sections').doc(k), doc);
    tx.update(siteRef, { nav: p.nav, draftChangedAt: new Date().toISOString() });
  });
  console.log(`Written. Publish the website in the app: Website-Sitemap of ${siteId}, «Veröffentlichen».`);
}
