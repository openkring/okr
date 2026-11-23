#!/usr/bin/env node
/**
 * «Über den Verein» (la21staefa_verein) as on www.la21staefa.ch: the intro on top, the eleven topics as one
 * accordion in the 'cards' view (two columns from tablet width, underlined titles, plus/minus icons, the
 * open text on a light aubergine panel), then the address block.
 *
 *   node scripts/la21staefa/verein-accordion.mjs           # dry run: prints what it would write
 *   node scripts/la21staefa/verein-accordion.mjs --write
 *
 * - Creates `sections/la21staefa_verein_accordion`; its items reference the existing articles s02–s12, which stay
 *   untouched (an accordion renders its items' text).
 * - Sets the page's section list to [s01, accordion, s13, s14] — only while it still is the imported s01…s14
 *   list; an edited page is reported and left alone.
 * - Repairs the address block s13 (the import lost the line breaks between street, place and e-mail) and sets it
 *   in two columns: address | Postkonto. Stops, also in the dry run, when s13 is an article with blocks.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoBlocksIn } from '../lib/block-article-guard.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const T = 'la21staefa';
const PAGE = 'la21staefa_verein';
const ACCORDION = `${PAGE}_accordion`;
const sid = (n) => `${PAGE}_s${String(n).padStart(2, '0')}`;
const IMPORTED = Array.from({ length: 14 }, (_, i) => sid(i + 1));
const ITEMS = Array.from({ length: 11 }, (_, i) => sid(i + 2));
const NEW_SECTIONS = [sid(1), ACCORDION, sid(13), sid(14)];

// two columns from 640px (address | Postkonto), stacked below; the classes are in the site's tailwind.css
const ADDRESS_HTML = '<div class="grid sm:grid-cols-2 gap-8">'
  + '<div><p><strong>Verein Lokale Agenda 21<br>Rütihofstrasse 23<br>8712 Stäfa</strong><br>'
  + '<a href="mailto:info@la21staefa.ch">info@la21staefa.ch</a></p></div>'
  + '<div><p><strong>Postkonto:</strong><br>IBAN:  CH06 0900 0000 8763 3140 6<br>Verein Lokale Agenda 21 Stäfa</p></div>'
  + '</div>';

export function accordionSection(items) {
  return {
    name: ACCORDION,
    type: 'accordion',
    state: 'published',
    roleNeeded: 'public',
    colSize: '12',
    color: 0,
    title: '',
    subTitle: '',
    notes: 'Themen des Vereins als Akkordeon-Karten, wie auf www.la21staefa.ch (1.165)',
    tags: '',
    isArchived: false,
    tenants: [T],
    index: `n:${ACCORDION} a:accordion k:${ACCORDION}`,
    content: { htmlContent: '<p></p>', colSize: 3, position: 0 },
    properties: {
      multiple: false,
      readonly: true,
      value: '',
      items,
      viewType: 'cards',
      columns: { sm: 1, md: 2, lg: 2 },
      titleStyle: 'underline',
      titleSize: 1,
      iconColor: '#9e9e9e',
      iconPosition: 'end',
      textBackground: '#e2d6e2',
      textSize: 1,
    },
  };
}

async function main() {
  const write = process.argv.includes('--write');
  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();

  await assertNoBlocksIn(db, [ACCORDION, sid(13)]);

  const page = (await db.doc(`pages/${PAGE}`).get()).data();
  if (!page) throw new Error(`pages/${PAGE} missing`);
  const pageIsImported = JSON.stringify(page.sections) === JSON.stringify(IMPORTED);
  const pageIsDone = JSON.stringify(page.sections) === JSON.stringify(NEW_SECTIONS);

  const items = [];
  for (const key of ITEMS) {
    const s = (await db.doc(`sections/${key}`).get()).data();
    if (!s) throw new Error(`sections/${key} missing`);
    items.push({ key, label: s.title, value: key });
  }
  const accordion = accordionSection(items);

  console.log(`accordion ${ACCORDION}: ${items.length} items`);
  items.forEach((it, i) => console.log(`  ${String(i + 1).padStart(2)}. ${it.label}`));
  console.log(`address ${sid(13)}: line breaks repaired`);
  console.log(pageIsImported ? `page ${PAGE}: sections → ${NEW_SECTIONS.join(', ')}`
    : pageIsDone ? `page ${PAGE}: already has the accordion` : `page ${PAGE}: EDITED SINCE THE IMPORT, left alone: ${page.sections.join(', ')}`);
  if (!write) { console.log('\nDry run — nothing written. Pass --write.'); return; }

  const batch = db.batch();
  batch.set(db.doc(`sections/${ACCORDION}`), accordion);
  batch.update(db.doc(`sections/${sid(13)}`), { 'content.htmlContent': ADDRESS_HTML });
  if (pageIsImported) batch.update(db.doc(`pages/${PAGE}`), { sections: NEW_SECTIONS });
  await batch.commit();
  console.log('\nWritten.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
