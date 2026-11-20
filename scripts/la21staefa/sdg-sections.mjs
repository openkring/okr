#!/usr/bin/env node
/**
 * The SDG goals of each la21staefa project as a tiles section (layout 'logos', 2026-11-20): the title
 * «Folgende Nachhaltigkeitsziele (SDGs) sind mit diesem Projekt verbunden» linked to unric.org, the goal squares
 * (storage tenant/la21staefa/sdg/sdgNN.svg) side by side, each linked to its UN page, on mauve (#976C8B).
 *
 *   node scripts/la21staefa/sdg-sections.mjs           # dry run: prints what it would write
 *   node scripts/la21staefa/sdg-sections.mjs --write
 *
 * - Creates `sections/<page>_sdg` per project page.
 * - Places it as the page's last section, directly above the site footer. Where the page still ends with the
 *   imported text-only SDG article («Folgende Nachhaltigkeitsziele (SDG's) …»), the new section takes its place
 *   in the list; the old article document stays untouched (not shown anymore).
 * - Idempotent: a page that already lists its `_sdg` section is left alone (the section document is rewritten).
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const T = 'la21staefa';
const TITLE = 'Folgende Nachhaltigkeitsziele (SDGs) sind mit diesem Projekt verbunden';
const TITLE_URL = 'https://unric.org/de/17ziele';
const BACKGROUND = '#976C8B';
const UN = 'https://www.un.org/sustainabledevelopment/';

/** the 17 goals: German name (as on the homepage) and the slug of the UN detail page */
export const GOALS = {
  1: ['Keine Armut', 'poverty'],
  2: ['Kein Hunger', 'hunger'],
  3: ['Gesundheit und Wohlergehen', 'health'],
  4: ['Hochwertige Bildung', 'education'],
  5: ['Geschlechtergleichheit', 'gender-equality'],
  6: ['Sauberes Wasser und Sanitäreinrichtungen', 'water-and-sanitation'],
  7: ['Bezahlbare und saubere Energie', 'energy'],
  8: ['Menschenwürdige Arbeit und Wirtschaftswachstum', 'economic-growth'],
  9: ['Industrie, Innovation und Infrastruktur', 'infrastructure-industrialization'],
  10: ['Weniger Ungleichheiten', 'inequality'],
  11: ['Nachhaltige Städte und Gemeinden', 'cities'],
  12: ['Nachhaltige/r Konsum und Produktion', 'sustainable-consumption-production'],
  13: ['Massnahmen zum Klimaschutz', 'climate-change'],
  14: ['Leben unter Wasser', 'oceans'],
  15: ['Leben an Land', 'biodiversity'],
  16: ['Frieden, Gerechtigkeit und starke Institutionen', 'peace-justice'],
  17: ['Partnerschaften zur Erreichung der Ziele', 'globalpartnerships'],
};

/** page key → the goals of the project, in the order the owner gave them (2026-11-20) */
export const PROJECTS = {
  la21staefa_bauundenergie_content: [7, 9, 11, 13, 17],
  la21staefa_begegnungintegr_content: [1, 4, 5, 8, 10],
  la21staefa_btvzbauteilezur_content: [9, 12, 13, 17],
  la21staefa_gutwohneninstaf_content: [11, 10, 3, 17],
  la21staefa_lokalfair_content: [2, 3, 11, 12, 17],
  la21staefa_kissstafa_content: [1, 3, 10, 11, 17],
  la21staefa_oasekirchbuhl_content: [1, 10, 11, 12, 17],
  la21staefa_reparaturcafest_content: [11, 12, 13, 17],
  la21staefa_smart_content: [2, 3, 11, 12, 13],
  la21staefa_stafnet_content: [1, 10, 11, 12, 17],
  la21staefa_zukunftsburosta_content: [4, 5, 8, 10, 17],
};

export function goalTile(n) {
  const [name, slug] = GOALS[n];
  return {
    title: `${n} ${name}`,
    url: `${UN}${slug}/`,
    imageUrl: `tenant/${T}/sdg/sdg${String(n).padStart(2, '0')}.svg`,
    imageFit: 'contain',
    tone: 'primary',
  };
}

export function sdgSection(pageKey, goals) {
  const name = `${pageKey}_sdg`;
  return {
    name,
    type: 'tiles',
    state: 'published',
    roleNeeded: 'none',
    colSize: '12',
    color: 0,
    title: TITLE,
    subTitle: '',
    notes: 'Nachhaltigkeitsziele des Projekts (SDG-Logos, 2026-11-20)',
    tags: '',
    isArchived: false,
    tenants: [T],
    index: `n:${name} a:tiles k:${name}`,
    content: { htmlContent: '<p></p>', colSize: 3, position: 0 },
    properties: {
      variant: 'image',
      layout: 'logos',
      columns: 6,
      titleUrl: TITLE_URL,
      background: BACKGROUND,
      items: goals.map(goalTile),
    },
  };
}

/** the imported text-only SDG article: an article whose title starts like the new section's */
const isOldSdgArticle = (s) => s?.type === 'article' && /^Folgende Nachhaltigkeitsziele/.test(s.title ?? '');

/** The new section list: the old SDG article replaced in place, else the new section appended. */
export function placeSdg(sections, sdgKey, oldKey) {
  if (sections.includes(sdgKey)) return sections;
  if (oldKey && sections[sections.length - 1] === oldKey) return [...sections.slice(0, -1), sdgKey];
  return [...sections, sdgKey];
}

async function main() {
  const write = process.argv.includes('--write');
  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();

  const batch = db.batch();
  for (const [pageKey, goals] of Object.entries(PROJECTS)) {
    const page = (await db.doc(`pages/${pageKey}`).get()).data();
    if (!page) throw new Error(`pages/${pageKey} missing`);
    const sections = page.sections ?? [];
    const lastKey = sections[sections.length - 1];
    const last = lastKey ? (await db.doc(`sections/${lastKey}`).get()).data() : undefined;
    const oldKey = isOldSdgArticle(last) ? lastKey : undefined;
    const section = sdgSection(pageKey, goals);
    const next = placeSdg(sections, section.name, oldKey);
    const changed = next !== sections;
    console.log(`${pageKey}: goals ${goals.join(',')} → ${!changed ? 'already placed' : oldKey ? `replaces ${oldKey.split('_').pop()}` : 'appended'}`);
    batch.set(db.doc(`sections/${section.name}`), section);
    if (changed) batch.update(db.doc(`pages/${pageKey}`), { sections: next });
  }
  if (!write) { console.log('\nDry run — nothing written. Pass --write.'); return; }
  await batch.commit();
  console.log('\nWritten.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
