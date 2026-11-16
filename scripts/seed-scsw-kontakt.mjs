/**
 * ONE-TIME DATA SEED — the website's /kontakt becomes the CMS page `pages/scsw_kontakt` (tenant `scs`),
 * replacing the hand-written fixed page apps/scs-website/templates/pages/kontakt.hbs.
 *
 * Writes:
 *   1. sections/scsw_kontakt_hero  — hero without image (= the light band): intro above the title, title, lead (de + en)
 *   2. sections/scsw_kontakt_info  — text article: Adresse, E-Mail, Social, IBAN (de + en). Followed directly
 *                                    by the form, the website draws both as one two-column row
 *                                    (render lib columnPairStarts + partials/section-pair.hbs).
 *   3. sections/scsw_kontakt_form  — UPDATE only: title «Nachricht senden» (+ en); recipients, form and
 *                                    rate limit stay as they are.
 *   4. sections/scsw_kontakt_map   — iframe: the OpenStreetMap embed of the old page
 *   5. pages/scsw_kontakt          — sections = [hero, info, form, map]; isPrivate: false
 *   6. sections/scsw_kt1, scsw_kt2 (the WordPress import, doc ids below) — archived (isArchived: true),
 *      not deleted: they are no longer on the page.
 *
 * The page node itself (`p-kontakt`, slug `kontakt`, under «Kontakt») comes from the site tree:
 * apps/scs-website/tests/fixtures/site.json → `node scripts/seed-website-scs.mjs --update --apply`.
 *
 * ORDER (the fixed page and the tree page both render kontakt.html; the renderer refuses two files):
 *   a) node scripts/seed-scsw-kontakt.mjs --apply
 *   b) node scripts/seed-website-scs.mjs --update --apply   (tree: link → page node)
 *   c) pnpm website:deploy scs                               (templates without the fixed page)
 * Between b) and c) a publish from the app fails with «two files at kontakt.html»; the live site is untouched.
 *
 * Usage:
 *   node scripts/seed-scsw-kontakt.mjs           # dry run (default): prints every write
 *   node scripts/seed-scsw-kontakt.mjs --apply   # writes PRODUCTION Firestore
 * Requires: gcloud auth application-default login
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { argv, exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'bkaiser-org';
const TENANT = 'scs';
const APPLY = argv.includes('--apply');
const PAGE_KEY = 'scsw_kontakt';
/** the two sections of the WordPress import (migrate-scs-wp-content.mjs: scsw_kt1, scsw_kt2) */
const OLD_SECTIONS = { cmnkcalm8gqfg40c93qf: 'scsw_kt1', exs2002dl9t2vehwufi0: 'scsw_kt2' };
const NOTE = 'Seite /kontakt der Website (seed-scsw-kontakt.mjs, 2026-11-16).';

const IMAGE_STYLE = {
  sizes: '(max-width: 1240px) 50vw, 300px', action: 1, hasPriority: false, isThumbnail: false, imgIxParams: '',
  showTitle: true, slot: 'none', showSource: true, borderRadius: '4', captionPosition: 'top-overlay',
  captionStyle: 'bold', width: '100%', border: '1px', height: 'auto', fill: false, captionSize: '1rem', zoomFactor: 2,
};

function section(name, type, title, indexWords, properties, htmlContent = '<p></p>') {
  return {
    name, type, title, subTitle: '', tags: '', notes: NOTE,
    index: `n:${name} t:${type} tt:${indexWords} st:`,
    colSize: '12', color: 0,
    content: { colSize: 6, htmlContent, position: 0 },
    roleNeeded: 'contentAdmin', state: 'published', isArchived: false, tenants: [TENANT],
    properties,
  };
}

// the left column of the old page: small uppercase headings (h3) over each block
const info = (h) => `<h3>${h.address}</h3>
<p>Seeclub Stäfa<br>Seestrasse 2b<br>8712 Stäfa<br>${h.country}</p>
<h3>${h.email}</h3>
<p><a href="mailto:info@seeclub-staefa.ch">info@seeclub-staefa.ch</a></p>
<h3>Social</h3>
<p><a href="https://www.instagram.com/seeclub_staefa/">Instagram @seeclub_staefa</a></p>
<h3>IBAN</h3>
<p>CH67 0070 0110 4044 7417 6</p>`;
const INFO_DE = info({ address: 'Adresse', country: 'Schweiz', email: 'E-Mail' });
const INFO_EN = info({ address: 'Address', country: 'Switzerland', email: 'Email' });

export const NEW_SECTIONS = {
  scsw_kontakt_hero: { ...section('scsw_kontakt_hero', 'hero', 'Kontakt', 'kontakt', {
    introI18n: { en: 'Contact' },
    titleI18n: { en: 'Contact' },
    subTitleI18n: { en: 'Questions about the club, our courses or the boathouse project? We look forward to hearing from you.' },
    ctas: [],
  }, ''), intro: 'Kontakt', introPosition: 'above' },
  scsw_kontakt_info: section('scsw_kontakt_info', 'article', '', 'kontakt adresse iban', {
    images: [], imageStyle: IMAGE_STYLE,
    contentI18n: { en: INFO_EN },
  }, INFO_DE),
  scsw_kontakt_map: section('scsw_kontakt_map', 'iframe', '', 'kontakt karte', {
    url: 'https://www.openstreetmap.org/export/embed.html?bbox=8.7132%2C47.2286%2C8.7332%2C47.2486&layer=mapnik&marker=47.2386%2C8.7232',
    style: 'width: 100%; min-height: 400px; border: none',
  }),
};
NEW_SECTIONS.scsw_kontakt_hero.subTitle = 'Du hast Fragen zum Verein, zu Kursen oder zum Bootshaus-Projekt? Wir freuen uns auf deine Nachricht.';

export const FORM_UPDATE = {
  title: 'Nachricht senden',
  'properties.titleI18n': { en: 'Send a message' },
  notes: 'Kontaktformular auf der Website (/kontakt, Seite scsw_kontakt). Nachrichten gehen per E-Mail an die Adressen unten, nichts wird gespeichert.',
};

export const PAGE_UPDATE = {
  sections: ['scsw_kontakt_hero', 'scsw_kontakt_info', 'scsw_kontakt_form', 'scsw_kontakt_map'],
  isPrivate: false,
};

function db() {
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  return getFirestore();
}

async function main() {
  for (const [id, data] of Object.entries(NEW_SECTIONS)) console.log(`\n── set sections/${id}\n${JSON.stringify(data, null, 2)}`);
  console.log(`\n── update sections/scsw_kontakt_form\n${JSON.stringify(FORM_UPDATE, null, 2)}`);
  console.log(`\n── update pages/${PAGE_KEY}\n${JSON.stringify(PAGE_UPDATE, null, 2)}`);
  for (const [id, name] of Object.entries(OLD_SECTIONS)) console.log(`\n── update sections/${id} (${name}): isArchived: true`);

  const store = db();
  const page = await store.collection('pages').doc(PAGE_KEY).get();
  if (!page.exists || !(page.get('tenants') ?? []).includes(TENANT)) throw new Error(`pages/${PAGE_KEY} missing or not in tenant ${TENANT}`);
  console.log(`\ncurrent pages/${PAGE_KEY}.sections: ${JSON.stringify(page.get('sections'))}`);
  const form = await store.collection('sections').doc('scsw_kontakt_form').get();
  if (!form.exists || form.get('type') !== 'form') throw new Error('sections/scsw_kontakt_form missing or not a form section');
  for (const id of Object.keys(NEW_SECTIONS)) {
    if ((await store.collection('sections').doc(id).get()).exists) console.log(`note: sections/${id} exists and will be replaced`);
  }
  if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); return; }

  for (const [id, data] of Object.entries(NEW_SECTIONS)) {
    await store.collection('sections').doc(id).set(data);
    console.log(`✓ sections/${id}`);
  }
  await store.collection('sections').doc('scsw_kontakt_form').update(FORM_UPDATE);
  console.log('✓ sections/scsw_kontakt_form');
  await store.collection('pages').doc(PAGE_KEY).update(PAGE_UPDATE);
  console.log(`✓ pages/${PAGE_KEY}`);
  for (const id of Object.keys(OLD_SECTIONS)) {
    const old = await store.collection('sections').doc(id).get();
    if (old.exists) { await store.collection('sections').doc(id).update({ isArchived: true }); console.log(`✓ sections/${id} archived`); }
  }
}

if (argv[1] === fileURLToPath(import.meta.url)) main().then(() => exit(0)).catch((e) => { console.error(e); exit(1); });
