/**
 * ONE-TIME DATA SEED — the first website sitemap (spec 1.153, part 1):
 *   - `menuItems/cms-website-sitemap`, a `navigate` row to /private/website/sitemap/@TID@ (role
 *     `contentAdmin`, tenant `scs`), hung FIRST into the `cms-website` submenu, and
 *   - `websites/scs`, the navigation tree of today's apps/scs-website/assets/shared.js header
 *     (desktop nav: «Der Club» / «Termine» / «News» / «Kontakt» + the «Mitgliederbereich» button).
 *
 * The scsw_* pages that are not in the nav (scsw_bootshausprojekt, scsw_kontakt,
 * scsw_kurs_erwachsene, scsw_kurs_jugendliche) are deliberately NOT in the tree. Labels are plain
 * German text, not i18n keys. Page slug = key without `scsw_`, `_` -> `-`. Node ids are stable,
 * readable ids (the model says «random, stable within the site»; these are unique within the site).
 *
 * SAFETY
 *  - refuses when `websites/scs` already exists (never overwrites an edited tree);
 *  - the menu doc is created with create() (fails when it exists); the parent only gets the row
 *    prepended when it is not listed yet;
 *  - release first, seed second: with --apply the menu label must already be live on the scs
 *    app (assertMenuLabelsLive, scripts/lib/menu-labels.mjs).
 *
 * Usage:
 *   node scripts/seed-website-scs.mjs              # dry run (default): prints the planned writes as JSON
 *   node scripts/seed-website-scs.mjs --dry-run    # dry run (explicit)
 *   node scripts/seed-website-scs.mjs --apply      # perform the writes (production data!)
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS). A dry run
 * still prints the plan when Firestore is unreachable, and says which checks could not run.
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { assertMenuLabelsLive } from './lib/menu-labels.mjs';

const TENANT = 'scs';
const SITE_ID = 'scs';
const ROW = 'cms-website-sitemap';
const PARENT = 'cms-website';
const apply = process.argv.includes('--apply');

const page = (key, label) => ({
  id: `p-${key.replace(/^scsw_/, '').replace(/_/g, '-')}`,
  type: 'page',
  label,
  pageKey: key,
  slug: key.replace(/^scsw_/, '').replace(/_/g, '-'),
});
const link = (id, label, url, style) => ({ id: `l-${id}`, type: 'link', label, url, ...(style ? { style } : {}) });
const menu = (id, label, children) => ({ id: `m-${id}`, type: 'menu', label, children });

/** shared.js renderHeader(), desktop nav. Anchor/static pages become site-relative links. */
export const NAV = [
  menu('club', 'Der Club', [
    link('ueber-uns', 'Über uns', '/#ueber-uns'),
    link('bootshaus', 'Bootshausprojekt', '/bootshaus'),
    page('scsw_breitensport', 'Breitensport'),
    page('scsw_leistungssport', 'Leistungssport'),
    page('scsw_vorstand', 'Vorstand'),
    page('scsw_gss', 'Gönnerverein'),
    page('scsw_statuten', 'Statuten'),
    page('scsw_altherren', 'Alt Herren'),
  ]),
  menu('termine', 'Termine', [
    link('termine-alle', 'Alle', '/termine'),
    link('termine-regatta', 'Regatten', '/termine?cat=regatta'),
    link('termine-club', 'Anlässe', '/termine?cat=club'),
    link('termine-course', 'Kurse', '/termine?cat=course'),
  ]),
  menu('news', 'News', [
    link('news-alle', 'Alle', '/news'),
    link('news-regatten', 'Regatten', '/news?tag=Regatten'),
    link('news-anlaesse', 'Anlässe', '/news?tag=Anl%C3%A4sse'),
    link('news-diamond-row', 'Diamond Row', '/news?tag=Diamond%20Row'),
    link('news-bootshaus', 'Bootshausprojekt', '/news?tag=Bootshausprojekt'),
  ]),
  menu('kontakt', 'Kontakt', [
    page('scsw_mitgliedschaft', 'Mitgliedschaft beantragen'),
    link('kontakt-form', 'Kontaktformular', '/kontakt'),
    page('scsw_praeventionsstelle', 'Präventionsstelle'),
  ]),
  link('mitgliederbereich', 'Mitgliederbereich', 'https://seeclub.org/', 'button'),
];

const WEBSITE = {
  name: 'Seeclub Stäfa Website',
  tenants: [TENANT],
  isArchived: false,
  hostingSite: 'scs-website-54aef',
  domain: 'https://www.seeclub.org',
  languages: ['de', 'en'],
  templateVersion: '',
  tagline: '',
  nav: NAV,
  footer: [],
  homePageKey: 'scsw_homepage',
  draftChangedAt: new Date().toISOString(),
};

/** The same shape the seed-*-menu scripts / planMenuOps create. */
const MENU_DOC = {
  name: ROW,
  url: '/private/website/sitemap/@TID@',
  action: 'navigate',
  roleNeeded: 'contentAdmin',
  icon: 'org', // 'sitemap' is not in the icon repository; the CMS sitemap row cms-graph uses 'org'
  label: `@item.${ROW}`,
  tenants: [TENANT],
  menuItems: [],
  // isArchived is REQUIRED: getSystemQuery filters `isArchived == false`, which skips docs missing it.
  isArchived: false,
  index: `n:${ROW} a:navigate k:${ROW}`,
};

async function main() {
  const notes = [];
  let db = null;
  let siteExists = null;
  let menuExists = null;
  let parents = [];
  try {
    if (!getApps().length) initializeApp();
    db = getFirestore();
    siteExists = (await db.collection('websites').doc(SITE_ID).get()).exists;
    menuExists = (await db.collection('menuItems').doc(ROW).get()).exists
      || !(await db.collection('menuItems').where('name', '==', ROW).limit(1).get()).empty;
    parents = (await db.collection('menuItems').where('name', '==', PARENT).get()).docs
      .filter((d) => d.data().isArchived !== true && (d.data().tenants ?? []).includes(TENANT));
  } catch (err) {
    if (apply) throw err;
    notes.push(`Firestore unreachable (${String(err.message ?? err).split('\n')[0]}): existence checks for websites/${SITE_ID}, menuItems/${ROW} and the ${PARENT} parent could not run.`);
    db = null;
  }

  if (siteExists) {
    console.error(`REFUSED: websites/${SITE_ID} already exists — this seed never overwrites an edited tree.`);
    process.exit(1);
  }
  if (menuExists) notes.push(`menuItems/${ROW} already exists — it is left as is.`);

  const plan = [];
  if (db && menuExists === false || (!db)) {
    plan.push({ op: 'create', path: `menuItems/${ROW}`, data: MENU_DOC });
  }
  if (!db) {
    plan.push({ op: 'update', path: `menuItems/<doc named ${PARENT} with tenants ∋ ${TENANT}>`, data: { menuItems: `['${ROW}', ...existing]` } });
  }
  for (const snap of parents) {
    const children = snap.data().menuItems ?? [];
    if (children.includes(ROW)) { notes.push(`menuItems/${snap.id} already lists '${ROW}'.`); continue; }
    plan.push({ op: 'update', path: `menuItems/${snap.id}`, data: { menuItems: [ROW, ...children] } });
  }
  if (db && parents.length === 0) notes.push(`No active '${PARENT}' menu doc for tenant ${TENANT} — the row is created but not hung anywhere.`);
  plan.push({ op: 'create', path: `websites/${SITE_ID}`, data: WEBSITE });

  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY RUN', notes, writes: plan }, null, 2));
  if (!apply) { console.log('\nRe-run with --apply to write.'); return; }

  await assertMenuLabelsLive([MENU_DOC.label], [TENANT], { apply });
  for (const w of plan) {
    const ref = db.doc(w.path);
    if (w.op === 'create') await ref.create(w.data); // create(): a concurrent creation fails loudly
    else await ref.update(w.data);
    console.log(`  ${w.op}d ${w.path}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
