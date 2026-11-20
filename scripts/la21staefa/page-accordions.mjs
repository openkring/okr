#!/usr/bin/env node
/**
 * Imported la21staefa pages whose runs of topics become accordions, as on www.la21staefa.ch: the cards view (one column
 * on phones, one or more from tablet width), larger underlined titles, grey plus/minus icons at the end, the open text on a light
 * aubergine panel. The sections before and after the run stay where they are.
 *
 *   node scripts/la21staefa/page-accordions.mjs [page…]           # dry run: prints what it would write
 *   node scripts/la21staefa/page-accordions.mjs [page…] --write
 *
 * Without a page name every page in PAGES is handled.
 * - Creates `sections/<page>_accordion` (or the run's own key) once — an existing one is never overwritten; its items reference the existing articles of the run, which stay untouched
 *   (an accordion renders its items' text).
 * - Replaces the run in the page's section list by the accordion — only while the run's sections still stand together
 *   in the list; a run edited since the import is reported and left alone. A page may have several runs.
 *
 * Run: mitmachen, bauundenergie, kissstafa, begegnungintegration, btvz, gutwohnen, lokalfair, oasekirchbuhl, reparaturcafe, smart, stafnet and zukunftsburo on 2026-11-20.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { accordionSection as vereinAccordion } from './verein-accordion.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));

/**
 * short name → page key and its accordion runs: first and last imported section (sNN) of the run, notes, optional
 * `accordion` = the section key (default `<page>_accordion`; give one per run on a page with several runs), optional
 * `columns` = the number of card columns from tablet width (default 1; phones always show one).
 */
export const PAGES = {
  mitmachen: { page: 'la21staefa_mitmachen', runs: [{ from: 3, to: 9, notes: 'Wege zum Mitmachen' }] },
  bauundenergie: { page: 'la21staefa_bauundenergie_content', runs: [{ from: 3, to: 9, notes: 'Details zum Projekt Bau und Energie' }] },
  kissstafa: { page: 'la21staefa_kissstafa_content', runs: [{ from: 4, to: 11, notes: 'Details zum Projekt KISS Stäfa' }] },
  // two imported pages in one: Nettswerk Träff (s01–s15), then Begegnung und Integration (s16–s26) — this is the second
  begegnungintegration: { page: 'la21staefa_begegnungintegr_content', runs: [{ from: 19, to: 23, accordion: 'la21staefa_begegnungintegr_content_accordion_bi', notes: 'Projekte von Begegnung und Integration' }] },
  // BTVZ, then KreisWERK (s16–), then two event pages — this is «Details zur BTVZ»
  btvz: { page: 'la21staefa_btvzbauteilezur_content', runs: [{ from: 6, to: 11, accordion: 'la21staefa_btvzbauteilezur_content_accordion_btvz', notes: 'Details zur BTVZ' }] },
  gutwohnen: { page: 'la21staefa_gutwohneninstaf_content', runs: [{ from: 4, to: 10, notes: 'Projekte und Themen von Gut Wohnen in Stäfa' }] },
  lokalfair: { page: 'la21staefa_lokalfair_content', runs: [{ from: 8, to: 12, notes: 'Details zum Projekt Lokal + Fair' }] },
  oasekirchbuhl: { page: 'la21staefa_oasekirchbuhl_content', runs: [{ from: 4, to: 9, notes: 'Details zum Projekt Oase Kirchbühl' }] },
  reparaturcafe: { page: 'la21staefa_reparaturcafest_content', runs: [{ from: 8, to: 14, notes: 'Details zum Projekt Reparatur Café Stäfa' }] },
  // StäfNet (s01–s16), then the Musigtäg page (s17–)
  stafnet: { page: 'la21staefa_stafnet_content', runs: [{ from: 4, to: 12, accordion: 'la21staefa_stafnet_content_accordion_stafnet', notes: 'Fragen zu StäfNet und fürenand' }] },
  zukunftsburo: { page: 'la21staefa_zukunftsburosta_content', runs: [{ from: 4, to: 11, notes: 'Fragen zum Zukunftsbüro Stäfa' }] },
  smart: {
    page: 'la21staefa_smart_content',
    runs: [
      { from: 5, to: 16, accordion: 'la21staefa_smart_content_accordion_weekly', columns: 2, notes: 'Marktangebot jeden Samstag' },
      { from: 18, to: 36, accordion: 'la21staefa_smart_content_accordion_extra', columns: 2, notes: 'Zusätzliches Marktangebot' },
      { from: 38, to: 42, accordion: 'la21staefa_smart_content_accordion_about', notes: 'Über den SMäRT' },
    ],
  },
};

const sid = (page, n) => `${page}_s${String(n).padStart(2, '0')}`;

/**
 * What one run does to the page's current section list: 'done' when its accordion is already in the list, 'replace'
 * when its sections still stand together in the list (they are swapped for the accordion), else 'edited' (left alone).
 */
export function planRun(page, run, current) {
  const accordion = run.accordion ?? `${page}_accordion`;
  const items = Array.from({ length: run.to - run.from + 1 }, (_, i) => sid(page, run.from + i));
  if (current.includes(accordion)) return { accordion, items, action: 'done', sections: current };
  const at = current.indexOf(items[0]);
  const together = at >= 0 && items.every((key, i) => current[at + i] === key);
  if (!together) return { accordion, items, action: 'edited', sections: current };
  return { accordion, items, action: 'replace', sections: [...current.slice(0, at), accordion, ...current.slice(at + items.length)] };
}

/** the Verein accordion's formatting, but `columns` card columns from tablet width (default 1) and larger titles */
export function accordionSection(name, notes, items, columns = 1) {
  const base = vereinAccordion(items);
  const where = columns === 1 ? 'in einer Spalte' : `in ${columns} Spalten`;
  return {
    ...base,
    name,
    notes: `${notes} als Akkordeon-Karten ${where}, wie auf www.la21staefa.ch (1.165)`,
    index: `n:${name} a:accordion k:${name}`,
    properties: { ...base.properties, columns: { sm: 1, md: columns, lg: columns }, titleSize: 1.25 },
  };
}

async function handle(db, entry, write) {
  const page = (await db.doc(`pages/${entry.page}`).get()).data();
  if (!page) throw new Error(`pages/${entry.page} missing`);
  let sections = page.sections ?? [];
  const accordions = [];

  for (const run of entry.runs) {
    const planned = planRun(entry.page, run, sections);
    const items = [];
    for (const key of planned.items) {
      const s = (await db.doc(`sections/${key}`).get()).data();
      if (!s) throw new Error(`sections/${key} missing`);
      items.push({ key, label: s.title, value: key });
    }
    console.log(`\naccordion ${planned.accordion}: ${items.length} items, ${run.columns ?? 1} column(s) — ${planned.action}`);
    items.forEach((it, i) => console.log(`  ${String(i + 1).padStart(2)}. ${it.label}`));
    if (planned.action === 'edited') {
      console.log(`  EDITED SINCE THE IMPORT: ${planned.items[0]}…${planned.items.at(-1)} no longer stand together — left alone`);
      continue;
    }
    if (planned.action === 'done') continue; // never overwrite an accordion that may have been edited in the app
    sections = planned.sections;
    accordions.push(accordionSection(planned.accordion, run.notes, items, run.columns ?? 1));
  }

  const changed = JSON.stringify(sections) !== JSON.stringify(page.sections);
  console.log(changed ? `page ${entry.page}: sections → ${sections.join(', ')}` : `page ${entry.page}: section list unchanged`);
  if (!write || !accordions.length) return;

  const batch = db.batch();
  for (const a of accordions) batch.set(db.doc(`sections/${a.name}`), a);
  if (changed) batch.update(db.doc(`pages/${entry.page}`), { sections });
  await batch.commit();
  console.log('Written.');
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const names = args.filter((a) => !a.startsWith('--'));
  const unknown = names.filter((n) => !PAGES[n]);
  if (unknown.length) throw new Error(`unknown page(s): ${unknown.join(', ')} — known: ${Object.keys(PAGES).join(', ')}`);

  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();

  for (const name of names.length ? names : Object.keys(PAGES)) await handle(db, PAGES[name], write);
  if (!write) console.log('\nDry run — nothing written. Pass --write.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
