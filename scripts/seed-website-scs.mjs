/**
 * ONE-TIME DATA SEED — the first website sitemap (spec 1.153, part 1):
 *   - `menuItems/cms-website-sitemap`, a `navigate` row to /private/website/sitemap/@TID@ (role
 *     `contentAdmin`, tenant `scs`), hung FIRST into the `cms-website` submenu, and
 *   - `websites/scs`, the navigation tree of today's apps/scs-website/assets/shared.js header
 *     (desktop nav: «Der Club» / «Termine» / «News» / «Kontakt» + the «Mitgliederbereich» button).
 *
 * The scsw_* pages that are not in the nav (scsw_kontakt, scsw_kurs_erwachsene,
 * scsw_kurs_jugendliche) are deliberately NOT in the tree. scsw_bootshausprojekt IS: its page node
 * has slug `bootshaus` (not `bootshausprojekt`), so the old /bootshaus(.html) address and the nav
 * path stay the same (1.153 part 3, task 5). Labels are plain
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
 *   node scripts/seed-website-scs.mjs --update     # existing websites/scs: print the diff (nav/footer/settings, isPrivate)
 *   node scripts/seed-website-scs.mjs --update --apply [--set-hosting]   # write it after a y/N confirmation
 *
 * The tree is read from apps/scs-website/tests/fixtures/site.json (single source, lib/website-scs-seed.mjs).
 * Every page the tree references gets isPrivate: false; a missing page doc (scsw_homepage: run
 * scripts/seed-scsw-homepage.mjs first) refuses --apply. Server fields only on create or --set-hosting.
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS). A dry run
 * still prints the plan when Firestore is unreachable, and says which checks could not run.
 */

import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { createInterface } from 'node:readline';

import { assertMenuLabelsLive } from './lib/menu-labels.mjs';
import {
  EDITABLE_FIELDS, SERVER_FIELDS, buildWebsiteDoc, collectPageKeys, diffSite, loadFixture, parseArgs, planIsPrivate,
} from './lib/website-scs-seed.mjs';

const TENANT = 'scs';
const SITE_ID = 'scs';
const ROW = 'cms-website-sitemap';
const PARENT = 'cms-website';
const args = parseArgs(process.argv.slice(2));
if (args.error) { console.error(args.error); process.exit(2); }
const { apply, update, setHosting } = args;

/** The tree comes from the parity fixture (single source, see lib/website-scs-seed.mjs). */
const WEBSITE = buildWebsiteDoc(loadFixture());

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

const confirm = (question) => new Promise((resolve) => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.question(`${question} [y/N] `, (a) => { rl.close(); resolve(/^y(es)?$/i.test(a.trim())); });
});

/** Reads every page the tree references; prints each with its current isPrivate; returns the plan. */
async function planPages(db) {
  const refs = collectPageKeys(WEBSITE);
  const docs = {};
  for (const { key } of refs) {
    const snap = await db.collection('pages').doc(key).get();
    docs[key] = snap.exists ? snap.data() : null;
  }
  const plan = planIsPrivate(refs.map((r) => r.key), docs);
  console.log('\nPages referenced by nav/footer/homePageKey (isPrivate must be false for the public site):');
  for (const { key, usedAt } of refs) {
    const cur = docs[key] ? `isPrivate=${docs[key].isPrivate === undefined ? '(unset, model default true)' : docs[key].isPrivate}` : 'MISSING';
    const action = !docs[key] ? 'cannot seed' : plan.makePublic.includes(key) ? '-> set isPrivate: false' : 'ok';
    console.log(`  ${key.padEnd(28)} ${cur.padEnd(34)} ${action}   (${usedAt[0]}${usedAt.length > 1 ? ` +${usedAt.length - 1}` : ''})`);
  }
  console.log(`\nTo make public: ${plan.makePublic.length}; already public: ${plan.alreadyPublic.length}; missing: ${plan.missing.length}`);
  if (plan.missing.length) {
    console.log(`MISSING page docs: ${plan.missing.join(', ')}.${plan.missing.includes(WEBSITE.homePageKey) ? ` ${WEBSITE.homePageKey} is not seeded yet: run scripts/seed-scsw-homepage.mjs first (this script never creates pages).` : ''}`);
  }
  return plan;
}

async function main() {
  const notes = [];
  let db = null;
  let siteSnap = null;
  let menuExists = null;
  let parents = [];
  try {
    if (!getApps().length) initializeApp();
    db = getFirestore();
    siteSnap = await db.collection('websites').doc(SITE_ID).get();
    menuExists = (await db.collection('menuItems').doc(ROW).get()).exists
      || !(await db.collection('menuItems').where('name', '==', ROW).limit(1).get()).empty;
    parents = (await db.collection('menuItems').where('name', '==', PARENT).get()).docs
      .filter((d) => d.data().isArchived !== true && (d.data().tenants ?? []).includes(TENANT));
  } catch (err) {
    if (apply) throw err;
    notes.push(`Firestore unreachable (${String(err.message ?? err).split('\n')[0]}): existence checks for websites/${SITE_ID}, menuItems/${ROW}, the ${PARENT} parent and the page docs could not run.`);
    db = null;
  }
  const siteExists = siteSnap ? siteSnap.exists : null;

  if (update) return runUpdate(db, siteSnap, notes);

  if (siteExists) {
    console.error(`REFUSED: websites/${SITE_ID} already exists — create mode never overwrites an edited tree. Use --update to diff and apply changes.`);
    process.exit(1);
  }
  if (menuExists) notes.push(`menuItems/${ROW} already exists — it is left as is.`);

  const plan = [];
  if ((db && menuExists === false) || !db) {
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

  const pagePlan = db ? await planPages(db) : null;
  if (pagePlan) for (const key of pagePlan.makePublic) plan.push({ op: 'update', path: `pages/${key}`, data: { isPrivate: false } });
  else notes.push('Page isPrivate plan not computed (no Firestore): every referenced page would get isPrivate: false.');

  console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY RUN', notes, writes: plan }, null, 2));
  if (!apply) { console.log('\nRe-run with --apply to write.'); return; }
  if (pagePlan.missing.length) {
    console.error(`REFUSED: page docs missing (${pagePlan.missing.join(', ')}); seed them first. Nothing was written.`);
    process.exit(1);
  }

  await assertMenuLabelsLive([MENU_DOC.label], [TENANT], { apply });
  for (const w of plan) {
    const ref = db.doc(w.path);
    if (w.op === 'create') await ref.create(w.data); // create(): a concurrent creation fails loudly
    else await ref.update(w.data);
    console.log(`  ${w.op}d ${w.path}`);
  }
}

/** --update: diff nav/footer/settings (+ page isPrivate); apply only with --apply and a y/N confirmation. */
async function runUpdate(db, siteSnap, notes) {
  if (!db) { console.error('--update needs Firestore access (ADC).'); process.exit(1); }
  if (!siteSnap.exists) { console.error(`websites/${SITE_ID} does not exist — run without --update to create it.`); process.exit(1); }
  const existing = siteSnap.data();
  const lines = diffSite(existing, WEBSITE, { withServer: setHosting });
  console.log(`UPDATE ${apply ? '(APPLY)' : '(dry run)'} websites/${SITE_ID}${setHosting ? ' incl. server fields (--set-hosting)' : ` (server fields ${SERVER_FIELDS.join('/')} untouched)`}`);
  notes.forEach((n) => console.log(`note: ${n}`));
  console.log(lines.length ? `\nDiff (live -> fixture):\n${lines.join('\n')}` : '\nNo difference in nav/footer/settings.');
  const pagePlan = await planPages(db);
  if (!apply) { console.log('\nRe-run with --update --apply to write (asks for confirmation).'); return; }
  if (pagePlan.missing.length) { console.error(`REFUSED: page docs missing (${pagePlan.missing.join(', ')}); seed them first.`); process.exit(1); }
  if (!lines.length && !pagePlan.makePublic.length) { console.log('Nothing to write.'); return; }
  if (!(await confirm(`Write ${lines.length} site change(s) and set isPrivate:false on ${pagePlan.makePublic.length} page(s) in PRODUCTION?`))) { console.log('Aborted, nothing written.'); return; }
  const fields = setHosting ? [...EDITABLE_FIELDS, ...SERVER_FIELDS] : EDITABLE_FIELDS;
  if (lines.length) {
    await db.collection('websites').doc(SITE_ID).update({
      ...Object.fromEntries(fields.map((f) => [f, WEBSITE[f]])),
      draftChangedAt: new Date().toISOString(),
    });
    console.log(`  updated websites/${SITE_ID}`);
  }
  for (const key of pagePlan.makePublic) {
    await db.collection('pages').doc(key).update({ isPrivate: false });
    console.log(`  updated pages/${key}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
