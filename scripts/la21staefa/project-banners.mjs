#!/usr/bin/env node
/**
 * The header of each la21staefa project page (2026-11-20): a full-width colour banner with logo, title and subtitle,
 * then the project's header pictures of www.la21staefa.ch as a full-width slideshow.
 *
 *   node scripts/la21staefa/project-banners.mjs           # dry run: prints what it would write, downloads nothing
 *   node scripts/la21staefa/project-banners.mjs --write   # uploads the pictures, writes sections and pages
 *
 * - Banner `sections/<page>_banner`: an article like the KISS block (logo left, title + subtitle beside it, white
 *   text) with `emphasis: 'banner'` + `background`, which the website draws edge to edge without rounded corners
 *   and in place of the page's title band. Colour and logo are the group's, as on the Projektgruppen overview
 *   (groups/<key>.color, the group avatar). Title and subtitle are the question and answer of the page's imported
 *   header block, the question on top (or the group's subtitle where the page has none).
 * - Slider `sections/<page>_slider`: an article with the pictures of the header slideshow on www.la21staefa.ch
 *   (`HEADER_PHOTOS`, read from the page's Beaver Builder layout script; two Oase pictures that still point to the
 *   retired newpage.la21staefa.ch host are left out), self-running like the homepage header
 *   (fade, 3 s, 1 s). Uploaded to tenant/la21staefa/page/<page>/header/. BTVZ has no header pictures there: banner only.
 * - Both go on top of the page; the imported header block (`HEADER`) is taken off the page — its documents stay.
 *   Where that block holds more than the header (`KEEP`), it stays on the page without its title/logo.
 * - Idempotent: a rerun rewrites the two sections with the banner's current texts, trims nothing again and leaves
 *   the page order as it is.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const T = 'la21staefa';
const BUCKET = 'bkaiser-org.appspot.com';
const WP = 'https://www.la21staefa.ch/wp-content/uploads/';

/** project → the pictures of its header slideshow on www.la21staefa.ch (2026-11-20), in their order */
export const HEADER_PHOTOS = {
  kissstafa: ['2025/02/Haeder.jpg', '2026/09/20260906_105649_2_a.jpg', '2025/02/KISS_2.jpg', '2025/04/20250413_105832_2.jpg', '2025/04/20250413_105851_2.jpg'],
  bauundenergie: ['2023/06/Bau-Energie-05.jpg', '2024/04/BauEnergie-Bild-2_2.png', '2023/06/Bau-Energie-04.jpg', '2023/06/Bau-Energie-01.jpg', '2024/04/BauEnergie-Bild-1_2.png'],
  begegnungintegr: ['2023/04/Qatira_1-2.jpg', '2026/01/Qatira-Schwimmen-01.jpg', '2026/02/Osterkranzbasteln_haeder.jpg', '2026/02/infostand_haeder.jpg', '2026/02/fondue-haeder.jpg'],
  btvzbauteilezur: [],
  gutwohneninstaf: ['2026/09/gutwohnen-scaled.jpg'],
  lokalfair: ['2026/01/lokalfair-25-08.jpg', '2026/01/lokalfair-25-04.jpg', '2026/01/lokalfair-25-07.jpg', '2026/01/lokalfair-25-01.jpg', '2026/01/lokalfair-25-03.jpg', '2026/01/lokalfair-25-02.jpg'],
  oasekirchbuhl: ['2023/06/Oase-Diaschau-01.jpg', '2023/06/Oase-Diaschau-03.jpg', '2023/06/Oase-Diaschau-05.jpg', '2023/06/Oase-Diaschau-02.jpg', '2023/06/Oase-Diaschau-06.jpg', '2023/06/Oase-Diaschau-07.jpg'],
  qatira: ['2023/06/Qatira-01.jpg', '2023/06/Qatira-02.jpg', '2023/06/Qatira-03.jpg', '2023/06/Qatira-04.jpg', '2023/06/Qatira-05.jpg'],
  reparaturcafest: ['09', '03', '11', '10', '07', '15', '01', '14', '06', '13', '12', '08', '05', '04', '02'].map((n) => `2023/06/RCS-Diaschau-${n}.jpg`),
  smart: ['2026/11/20260815_091740_2.jpg', '2026/11/20260815_091551_2.jpg', '2026/11/20260815_091924_2-1.jpg', '2026/11/20260815_080528_2.jpg', '2024/11/L1000034_2.jpg', '2026/11/20261114_114630_2.jpg'],
  stafnet: ['2023/05/fuerenand_08_2.jpg', '2023/05/fuerenand_05.jpg', '2023/05/fuerenand_04.jpg', '2023/05/fuerenand_07_2.jpg', '2023/05/fuerenand_02.jpg', '2023/05/fuerenand_06_2.jpg', '2023/05/fuerenand_01.jpg', '2023/05/Flomarkt_01.jpg'],
  zukunftsburosta: ['2024/06/Visual-Zukunftsbuero-Staefa_neu.png', '2024/06/Website-Header-Zukunftbuero.jpg', '2024/05/L1000002_2.jpg', '2024/05/L1000009_2.jpg', '2024/05/L1000006_2.jpg', '2024/05/L1000005_2.jpg'],
};

/** project → its imported header block(s) (section suffixes); the first one gives title and subtitle */
export const HEADER = {
  kissstafa: ['s01'], bauundenergie: ['s01'], begegnungintegr: [], btvzbauteilezur: ['s01'], gutwohneninstaf: ['s01'],
  lokalfair: ['s01'], oasekirchbuhl: ['s01'], qatira: ['s01'], reparaturcafest: ['s01'], smart: ['s01'], stafnet: ['s01'],
  zukunftsburosta: ['s02', 's01'],
};

/** where the header block has no answer line: the subtitle, taken from the block's first bold sentence */
export const SUBTITLE = {
  bauundenergie: 'Die Projektgruppe Bau & Energie der Lokalen Agenda 21 hat unter anderem den Stromspar-Wettbewerb Stäfa 2017 organisiert.',
  gutwohneninstaf: 'Die Projektgruppe setzt sich ein für Wohnraum für Jung und Alt, für neue Wohnformen und genossenschaftliches Wohnen.',
};

/**
 * Header blocks that hold more than the header: they stay on the page, the banner takes their title, subtitle,
 * logo (and, for bauundenergie, the first bold sentence, now the banner's subtitle).
 */
export const KEEP = {
  bauundenergie: (s) => ({ title: '', subTitle: '', images: withoutLogos(s), html: dropFirstParagraph(s.content?.htmlContent ?? '') }),
  qatira: (s) => ({ title: s.title, subTitle: '', images: withoutLogos(s), html: s.content?.htmlContent ?? '' }),
};

const isLogo = (img) => /logo/i.test(String(img?.url ?? '').split('/').pop());
export const withoutLogos = (s) => (s.properties?.images ?? []).filter((img) => !isLogo(img));
export const dropFirstParagraph = (html) => html.replace(/^\s*<p>[\s\S]*?<\/p>/, '');

/** the KISS block's image style (one logo beside the text) */
const LOGO_STYLE = {
  imgIxParams: '', width: '100%', height: 'auto', sizes: '(max-width: 786px) 50vw, 100vw', border: '', borderRadius: '',
  fill: true, hasPriority: false, action: 0, zoomFactor: 2, isThumbnail: false, slot: 'none',
};

const image = (url, altText) => ({ actionUrl: '', altText, credit: '', documentKey: '', label: '', overlay: '', type: 0, url });

const base = (name, title, subTitle, notes) => ({
  name, type: 'article', state: 'published', roleNeeded: 'none', colSize: '12', color: 0, title, subTitle, notes,
  tags: '', isArchived: false, tenants: [T], index: `n:${name} a:article k:${name}`,
});

export function bannerSection(pageKey, group, title, subTitle) {
  return {
    ...base(`${pageKey}_banner`, title, subTitle, 'Projekt-Banner: Logo, Titel, Untertitel auf der Gruppenfarbe, volle Breite (2026-11-20)'),
    content: { htmlContent: '<p></p>', colSize: 3, position: 3 }, // logo left, 3 of 12 columns
    properties: {
      images: group.logo ? [image(group.logo, `${group.name} Logo`)] : [],
      imageStyle: LOGO_STYLE,
      emphasis: 'banner',
      background: group.color,
      textColor: 'light',
    },
  };
}

export function sliderSection(pageKey, group, paths) {
  return {
    ...base(`${pageKey}_slider`, '', '', 'Bilder des Projekts von www.la21staefa.ch als Slideshow, volle Breite (2026-11-20)'),
    content: { htmlContent: '', colSize: 3, position: 1 },
    properties: {
      images: paths.map((p, i) => image(p, `${group.name} – Bild ${i + 1}`)),
      imageLayout: 'slider',
      slideshow: { effect: 'fade', autoplay: true, interval: 3, duration: 1 },
      imageStyle: { ...LOGO_STYLE },
    },
  };
}

/** The new section list: banner, slider (if any), then the rest without the header blocks taken off. */
export function placeHeader(sections, bannerKey, sliderKey, removed) {
  const rest = sections.filter((k) => k !== bannerKey && k !== sliderKey && !removed.includes(k));
  return [bannerKey, ...(sliderKey ? [sliderKey] : []), ...rest];
}

/** The question on top, as on www.la21staefa.ch (the KISS block has them the other way round): [title, subtitle]. */
export function questionFirst(title, subTitle) {
  const tidy = (t) => t.replace(/\s+\?$/, '?');
  const [a, b] = [tidy(title), tidy(subTitle)];
  return b.endsWith('?') && !a.endsWith('?') ? [b, a] : [a, b];
}

/** a storage file name from a picture path: the last segment, safe characters only */
export const fileName = (path) => path.split('/').pop().replace(/[^A-Za-z0-9._-]/g, '_');

async function main() {
  const write = process.argv.includes('--write');
  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  const { getStorage } = rootRequire('firebase-admin/storage');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org', storageBucket: BUCKET });
  const db = getFirestore();
  const bucket = getStorage().bucket(BUCKET);

  const batch = db.batch();
  for (const [project, photos] of Object.entries(HEADER_PHOTOS)) {
    const groupKey = `${T}_${project}`;
    const pageKey = `${groupKey}_content`;
    const [g, avTenant, avShared, pageSnap] = await Promise.all([
      db.doc(`groups/${groupKey}`).get(), db.doc(`avatars/${T}.group.${groupKey}`).get(), db.doc(`avatars/group.${groupKey}`).get(),
      db.doc(`pages/${pageKey}`).get(),
    ]);
    const page = pageSnap.data();
    if (!g.exists || !page) throw new Error(`${groupKey}: group or page missing`);
    const group = {
      name: g.data().name ?? '', subTitle: g.data().subTitle ?? '', color: g.data().color ?? '',
      logo: avTenant.data()?.storagePath ?? avShared.data()?.storagePath ?? '',
    };
    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(group.color)) throw new Error(`${groupKey}: no group colour`);

    const headerKeys = HEADER[project].map((sfx) => `${pageKey}_${sfx}`);
    const headers = [];
    for (const key of headerKeys) headers.push((await db.doc(`sections/${key}`).get()).data());
    const head = headers[0];
    // a rerun keeps the banner's texts: the header block may have been trimmed already
    const earlier = (await db.doc(`sections/${pageKey}_banner`).get()).data();
    const [title, subTitle] = earlier ? [earlier.title, earlier.subTitle]
      : questionFirst((head?.title || group.subTitle).trim(), (SUBTITLE[project] ?? head?.subTitle ?? '').trim());

    // the slideshow pictures, uploaded once
    const paths = [];
    for (const photo of photos) {
      const path = `tenant/${T}/page/${pageKey}/header/${fileName(photo)}`;
      paths.push(path);
      if (!write) continue;
      const [exists] = await bucket.file(path).exists();
      if (exists) continue;
      const res = await fetch(`${WP}${photo}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw new Error(`${WP}${photo}: HTTP ${res.status}`);
      await bucket.file(path).save(Buffer.from(await res.arrayBuffer()), { contentType: res.headers.get('content-type') ?? 'image/jpeg', resumable: false });
    }

    const banner = bannerSection(pageKey, group, title, subTitle);
    const slider = paths.length ? sliderSection(pageKey, group, paths) : undefined;
    const keep = KEEP[project];
    const removed = keep ? headerKeys.slice(1) : headerKeys;
    const next = placeHeader(page.sections ?? [], banner.name, slider?.name, removed);
    const changed = next.length !== (page.sections ?? []).length || next.some((k, i) => k !== page.sections[i]);

    console.log(`${project}: ${group.color} «${title}» / «${subTitle}» · ${paths.length} pictures`
      + ` · off: ${removed.map((k) => k.split('_').pop()).join(',') || '–'}${keep ? ` · trimmed: ${headerKeys[0].split('_').pop()}` : ''}`
      + `${changed ? '' : ' · order unchanged'}`);

    batch.set(db.doc(`sections/${banner.name}`), banner);
    if (slider) batch.set(db.doc(`sections/${slider.name}`), slider);
    if (keep && head && !earlier) {
      const k = keep(head);
      batch.update(db.doc(`sections/${headerKeys[0]}`), {
        title: k.title, subTitle: k.subTitle, 'properties.images': k.images, 'content.htmlContent': k.html,
      });
    }
    if (changed) batch.update(db.doc(`pages/${pageKey}`), { sections: next });
  }
  if (!write) { console.log('\nDry run — nothing written. Pass --write.'); return; }
  await batch.commit();
  console.log('\nWritten.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
