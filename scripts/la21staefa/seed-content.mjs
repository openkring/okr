#!/usr/bin/env node
/**
 * Brings the content of www.la21staefa.ch into the la21staefa app and website (spec 1.165, plan Task 12):
 *
 *  - the 11 header pictures → Storage, an article «Der Verein für Nachhaltigkeit in Stäfa» that shows them
 *    as a slideshow (fade 1 s, 3 s per picture — the WordPress header's settings);
 *  - the 12 project groups → groups (name, subtitle = the card teaser, colour = the card colour), each with its
 *    group calendar, its logo as group avatar and a public content page (`<key>_content`) with the teaser;
 *  - a tiles section «Projektgruppen» with source 'groups' (one card per public group, «mehr …»);
 *  - the SDG banner; the footer (membership, newsletter, social media, Impressum) as a footer section that the
 *    website draws instead of its template footer (`websites/la21staefa.footerSectionKey`);
 *  - a «Projektgruppen» menu in the website navigation with the 12 group pages (cards link to them).
 *
 * Dry run by default; --write applies it. Create-only: an existing document is never overwritten, except two
 * guarded updates — the home page's section list and the website's nav/footerSectionKey — which change only
 * while they still hold exactly what seed-website.mjs wrote (nobody has edited them yet).
 *
 *   node scripts/la21staefa/seed-content.mjs [--write]
 */
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));

const T = 'la21staefa';
const HOME = `${T}_home`;
const WP = 'https://www.la21staefa.ch/wp-content/uploads';
const BUCKET = 'bkaiser-org.appspot.com';
const GROUP_KEY_MAX_LENGTH = 15; // libs/subject/group/util group.util.ts

/** getGroupKeyFromName (libs/subject/group/util): `<tenant>_<deaccented lowercase alnum, max 15>`. */
export function groupKey(name) {
  const base = name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, GROUP_KEY_MAX_LENGTH);
  return `${T}_${base}`;
}

/** URL-safe slug of a group page in the website tree. */
export function slugOf(name) {
  return name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/&/g, 'und').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// The header slideshow of the WordPress home page (Beaver Builder row uxe3khnaicfw), in its order.
export const HERO_IMAGES = [
  '2026/10/Severin_herobild-2026.jpg', '2024/11/Mittsommerfest-2023-L1010887_2.jpg', '2024/11/L1000178_2-1.jpg',
  '2024/11/RCS-Diaschau-09.jpg', '2023/06/P1110006_2.jpg', '2023/06/LA21-Festival-.jpg', '2026/01/lokalfair-25-01.jpg',
  '2024/11/L1000034_2.jpg', '2024/11/IMG_5691_2-1.jpg', '2024/11/RCS-Diaschau-12.jpg', '2026/01/lokalfair-25-03.jpg',
];

// The 12 group cards of the WordPress home page, in its order. `name` ≤ 30 characters (group form cap).
export const GROUPS = [
  { name: 'Zukunftsbüro Stäfa', teaser: 'Und wo finden Sie Unterstützung für Ihre Ideen?', color: '#723973', logo: '2024/06/logo-zukunftswerkstatt-invers.webp' },
  { name: 'Gut Wohnen in Stäfa', teaser: 'Und wer bringt Bewegung in den Stäfner Wohnungsmarkt?', color: '#0792C6', logo: '2026/09/logo-gutwohnen-invers-1024-400.webp' },
  { name: 'SMäRT', teaser: 'Und wo trifft man sich am Samstag beim Einkaufen unter freiem Himmel zum Espresso?', color: '#6B8F7F', logo: '2023/03/logo-smart-invers-1.webp' },
  { name: 'BTVZ Bauteile Zürichsee', teaser: 'Und was machen Sie mit wiederverwendbaren Bauteilen?', color: '#59A3BF', logo: '2023/03/logo-btvz-invers-1.webp' },
  { name: 'Lokal + Fair', teaser: 'Und wo ist Einkaufen mehr, als nur konsumieren?', color: '#936A94', logo: '2026/01/logo-lokal-fair-invers.svg' },
  { name: 'StäfNet', teaser: 'Und wie fördern Sie Nachbarschaftshilfe und Kontakte in Stäfa?', color: '#C5C664', logo: '2023/03/logo-staefnet-invers-1.webp' },
  { name: 'Bau und Energie', teaser: 'Und wer gibt Anreize, damit Sie in Stäfa zur effizienten Nutzung der Energie beitragen können?', color: '#977162', logo: '2023/03/logo-bau-und-energie-traeff-invers-1.webp' },
  { name: 'Reparatur Café Stäfa', teaser: 'Und wohin bringen Sie Ihre defekten Lieblingssachen?', color: '#E3854C', logo: '2023/03/logo-reaparatur-invers-1.webp' },
  { name: 'Oase Kirchbühl', teaser: 'Und wo gibt es in Stäfa eine Oase der Fruchtbarkeit und Lebendigkeit?', color: '#A4CC4D', logo: '2023/03/logo-oase-invers-1.webp' },
  { name: 'KISS Stäfa', teaser: 'Und wie stärken Sie den Zusammenhalt über Generationen hinweg?', color: '#7B85BE', logo: '2023/03/logo-kiss-invers-1.webp' },
  { name: 'Begegnung & Integration', teaser: 'Und Ihr Engagement für die Integration von Menschen aus anderen Kulturen in Stäfa?', color: '#D25463', logo: '2023/03/logo-begegnungintegration-invers-1.webp' },
  { name: 'Qatira', teaser: 'Und wo treffen sich Junge ab 16 in Stäfa zum Fussballspielen?', color: '#AA444E', logo: '2023/03/logo-qatira-invers-1.webp' },
];

// The 17 UN Sustainable Development Goals (owner, 2026-11-20): the logo (SVG) from Wikimedia Commons, the goal icons
// from un.org (Commons throttled the goal files with HTTP 429), each goal linked to its page on un.org.
// Title = German name (alt text and tooltip of the icon).
const COMMONS = 'https://commons.wikimedia.org/wiki/Special:FilePath';
const UN_ICONS = 'https://www.un.org/sustainabledevelopment/wp-content/uploads/2018/05/E_SDG-goals_icons-individual-rgb-';
export const SDG_LOGO = 'Sustainable_Development_Goals.svg';
export const SDGS = [
  ['01NoPoverty', 'Keine Armut', 'poverty'], ['02ZeroHunger', 'Kein Hunger', 'hunger'],
  ['03GoodHealth', 'Gesundheit und Wohlergehen', 'health'], ['04QualityEducation', 'Hochwertige Bildung', 'education'],
  ['05GenderEquality', 'Geschlechtergleichheit', 'gender-equality'], ['06CleanWaterSanitation', 'Sauberes Wasser und Sanitäreinrichtungen', 'water-and-sanitation'],
  ['07CleanEnergy', 'Bezahlbare und saubere Energie', 'energy'], ['08DecentWork', 'Menschenwürdige Arbeit und Wirtschaftswachstum', 'economic-growth'],
  ['09Industry', 'Industrie, Innovation und Infrastruktur', 'infrastructure-industrialization'], ['10ReducedInequalities', 'Weniger Ungleichheiten', 'inequality'],
  ['11SustainableCities', 'Nachhaltige Städte und Gemeinden', 'cities'], ['12ResponsibleConsumption', 'Nachhaltige/r Konsum und Produktion', 'sustainable-consumption-production'],
  ['13Climate', 'Massnahmen zum Klimaschutz', 'climate-change'], ['14LifeBelowWater', 'Leben unter Wasser', 'oceans'],
  ['15LifeOnLand', 'Leben an Land', 'biodiversity'], ['16PeaceJusticeInstitutions', 'Frieden, Gerechtigkeit und starke Institutionen', 'peace-justice'],
  ['17Partnerships', 'Partnerschaften zur Erreichung der Ziele', 'globalpartnerships'],
].map(([, title, slug], i) => {
  const nn = String(i + 1).padStart(2, '0');
  return { file: `goal-${nn}.png`, source: `${UN_ICONS}${nn}.png`, title: `${i + 1} ${title}`, url: `https://www.un.org/sustainabledevelopment/${slug}/` };
});
const sdgPath = (file) => `tenant/${T}/sdg/${file}`;

/** The SDG block of the home page: the logo linked to un.org, the arrow opens the 17 goal icons (6 per row). */
export function sdgSection() {
  return section('sdg', 'tiles', '', {
    variant: 'image', columns: 6, layout: 'grid',
    // the header of the Commons file only (its viewBox cut to the UN emblem + «Sustainable Development Goals»,
    // without the 17 goal tiles below it) — uploaded as sdg-logo.svg, 2026-11-20
    collapse: { imageUrl: sdgPath('sdg-logo.svg'), url: 'https://www.un.org/sustainabledevelopment/', label: 'Ziele für nachhaltige Entwicklung (UNO)' },
    items: SDGS.map((g) => ({ title: g.title, url: g.url, imageUrl: sdgPath(g.file), imageFit: 'contain', tone: 'primary' })),
  }, { intro: 'Die 17 globalen Nachhaltigkeitsziele der UNO dienen der LA21 Stäfa als Orientierung zur Erreichung der Ziele.', introPosition: 'below' });
}

const IMAGE = { actionUrl: '', altText: '', credit: '', documentKey: '', label: '', overlay: '', type: 0, url: '' };
const IMAGE_STYLE = { imgIxParams: '', width: '100%', height: 'auto', sizes: '(max-width: 786px) 50vw, 100vw', border: '', borderRadius: '', fill: true, hasPriority: false, action: 0, zoomFactor: 2, isThumbnail: false, slot: 'none' };

const section = (key, type, title, properties = {}, extra = {}) => ({
  name: key, type, state: 'published', roleNeeded: 'none', colSize: '12', color: 0, title, subTitle: '',
  notes: 'LA21 Inhalte von www.la21staefa.ch (1.165)', content: { htmlContent: '', colSize: 3, position: 0 },
  properties, tags: '', isArchived: false, tenants: [T], index: `n:${key} a:${type} k:${key}`, ...extra,
});

const heroPath = (file) => `tenant/${T}/section/${HOME}_slideshow/${file.split('/').pop()}`;
const logoPath = (key, file) => `tenant/${T}/group/${key}/logo${extname(file)}`;

/** Every document the run creates (path → data), and the uploads (WordPress url → storage path). */
export function plan() {
  const docs = new Map();
  const uploads = new Map(HERO_IMAGES.map((f) => [`${WP}/${f}`, heroPath(f)]));

  docs.set(`sections/${HOME}_slideshow`, section('slideshow', 'article', 'Der Verein für Nachhaltigkeit in Stäfa', {
    images: HERO_IMAGES.map((f) => ({ ...IMAGE, url: heroPath(f) })),
    imageStyle: IMAGE_STYLE,
    imageLayout: 'slider',
    slideshow: { effect: 'fade', autoplay: true, interval: 3, duration: 1 },
  }, {
    subTitle: 'Seit 2001 setzt sich die LA21 mit ihren Projekten für gesellschaftliche Solidarität, ökologische Verantwortung und wirtschaftliche Leistungsfähigkeit ein.',
    content: { htmlContent: '', colSize: 3, position: 1 },
  }));
  docs.set(`sections/${HOME}_groups`, section('projektgruppen', 'tiles', '', {
    variant: 'image', columns: 3, items: [], source: 'groups', layout: 'grid', linkLabel: 'mehr …',
  }));
  uploads.set(`${COMMONS}/${SDG_LOGO}`, sdgPath(SDG_LOGO));
  for (const g of SDGS) uploads.set(g.source, sdgPath(g.file));
  docs.set(`sections/${HOME}_sdg`, sdgSection());
  docs.set(`unused/${HOME}_sdg_article`, section('sdg', 'article', '', {
    images: [{ ...IMAGE, url: `tenant/${T}/section/${HOME}_sdg/Schriftzug-SDG-klein.jpg`, altText: 'Die 17 Ziele für nachhaltige Entwicklung' }],
    imageStyle: IMAGE_STYLE,
    cta: { label: 'Die 17 Ziele der UNO', url: 'https://unric.org/de/17ziele/', style: 'secondary' },
  }, {
    content: { htmlContent: '<p>Die 17 globalen Nachhaltigkeitsziele der UNO dienen der LA21 Stäfa als Orientierung zur Erreichung der Ziele.</p>', colSize: 3, position: 1 },
  }));
  docs.delete(`unused/${HOME}_sdg_article`); // the first version (a picture article), replaced by sdgSection()

  docs.set(`sections/${T}_footer`, section('footer', 'footer', '', {
    columnCount: 3, showBottomLine: true, bottomLine: `© ${new Date().getFullYear()} Lokale Agenda 21 Stäfa`, background: '#3c163c',
    columns: [
      { items: [
        { type: 'title', label: 'Werden Sie Mitglied der LA21', url: '', icon: '', image: '', height: 'medium' },
        { type: 'text', label: 'und unterstützen Sie damit alle LA21-Projekte', url: '', icon: '', image: '', height: 'medium' },
        { type: 'button', label: 'Mitglied werden', url: 'mailto:info@la21staefa.ch?subject=Mitgliedschaft', icon: '', image: '', height: 'medium' },
      ] },
      { items: [
        { type: 'title', label: 'Abonnieren Sie den LA21 Newsletter', url: '', icon: '', image: '', height: 'medium' },
        { type: 'text', label: 'und wir informieren Sie regelmässig über unsere Projektgruppen', url: '', icon: '', image: '', height: 'medium' },
        { type: 'button', label: 'Newsletter abonnieren', url: 'https://la21staefa.us14.list-manage.com/subscribe?u=e2833a308a385ea464aa5c65e&id=40e385002b', icon: '', image: '', height: 'medium' },
      ] },
      { items: [
        { type: 'title', label: 'Kontakt', url: '', icon: '', image: '', height: 'medium' },
        { type: 'text', label: 'Verein Lokale Agenda 21 Stäfa\nBauertacherweg 4\n8712 Stäfa', url: '', icon: '', image: '', height: 'medium' },
        { type: 'link', label: 'info@la21staefa.ch', url: 'mailto:info@la21staefa.ch', icon: '', image: '', height: 'medium' },
      ] },
    ],
    social: [
      { label: 'Instagram', url: 'https://www.instagram.com/la21staefa/', icon: 'instagram' },
      { label: 'Facebook', url: 'https://www.facebook.com/lokaleagenda21staefa', icon: 'facebook' },
    ],
    bottomLinks: [
      { label: 'Impressum', url: '/impressum', icon: '' },
      { label: 'Datenschutz', url: '/datenschutz', icon: '' },
    ],
  }));

  for (const g of GROUPS) {
    const key = groupKey(g.name);
    uploads.set(`${WP}/${g.logo}`, logoPath(key, g.logo));
    docs.set(`groups/${key}`, {
      name: g.name, kind: 'group', subTitle: g.teaser, color: g.color, notes: '', tags: '', icon: 'group',
      hasContent: true, hasChat: false, hasCalendar: true, hasTasks: false, hasFiles: false, filesFolder: '', hasMembers: true,
      matrixRoomId: '', admins: [], adminKeys: [], parentKey: T, parentName: 'Lokale Agenda 21 Stäfa', parentModelType: 'org',
      visibility: '', tenants: [T], isArchived: false, index: `n:${g.name}`,
    });
    docs.set(`calendars/${key}`, {
      name: g.name, title: g.name, description: `Kalender für Gruppe ${g.name}`, owner: `group.${key}`, isPublic: true,
      tenants: [T], isArchived: false, index: `n:${g.name}`, tags: '', notes: '',
    });
    docs.set(`avatars/${T}.group.${key}`, { storagePath: logoPath(key, g.logo), tenants: [T], isArchived: false });
    // the page header already shows name and teaser: the intro section starts empty, for the group's own text
    docs.set(`sections/g-${key}`, section(`group-intro-${key}`, 'article', '', { images: [], imageStyle: IMAGE_STYLE }, {
      content: { htmlContent: '<p></p>', colSize: 3, position: 0 },
    }));
    docs.set(`pages/${key}_content`, {
      name: g.name, title: g.name, subTitle: g.teaser, type: 'content', state: 'published', isPrivate: false,
      sections: [`g-${key}`], tenants: [T], isArchived: false, index: `n:${g.name} a:content k:${key}_content`,
      abstract: '', notes: 'LA21 Gruppenseite (1.165)', tags: '', meta: [],
    });
  }
  // the groups as categories (owner, 2026-11-20): calevent types and news tags of this tenant. Own documents of
  // la21staefa win over the shared 'system' ones (AppStore pickForTenant). Item name = label (no i18n scope).
  docs.set(`categories/${T}_calevent_type`, {
    name: 'calevent_type', i18n: '', translateItems: false, hasAbbreviation: false, notes: 'LA21 Projektgruppen als Termin-Kategorien (1.165)',
    tags: '', isArchived: false, tenants: [T], index: 'n:calevent_type',
    items: [...GROUPS.map((g) => ({ name: g.name, icon: 'people-group', color: g.color })), { name: VEREIN_TYPE, icon: 'people-group', color: '#723973' }],
  });
  docs.set(`tags/${T}_section`, {
    tagModel: 'section', isArchived: false, tenants: [T],
    tags: [...SYSTEM_SECTION_TAGS, ...GROUPS.map((g) => g.name), VEREIN_TYPE].join(', '),
  });
  return { docs, uploads };
}

/** the calevent type (category) of an event of the association itself, not of a group */
export const VEREIN_TYPE = 'Verein LA21';
/** the shared section tags (tags/<system doc>, tagModel 'section') that the own document must keep */
const SYSTEM_SECTION_TAGS = ['@tag.important', '@tag.review', '@tag.selectable', '@tag.test', '@tag.comment', '@tag.pending'];

/** The seeded home page sections (seed-website.mjs) → the new order. */
export const SEEDED_HOME = [`${HOME}_hero`, `${HOME}_verein`, `${HOME}_events`, `${HOME}_news`];
export const NEW_HOME = [`${HOME}_slideshow`, `${HOME}_verein`, `${HOME}_groups`, `${HOME}_events`, `${HOME}_news`, `${HOME}_sdg`];

/** The website's nav with a «Projektgruppen» menu of the group pages in front of «Termine». */
export function navWithGroups(nav) {
  if (nav.some((n) => n.id === 'n-projektgruppen')) return nav;
  const menu = {
    id: 'n-projektgruppen', type: 'menu', label: 'Projektgruppen',
    children: GROUPS.map((g) => ({ id: `n-${slugOf(g.name)}`, type: 'page', label: g.name, pageKey: `${groupKey(g.name)}_content`, slug: slugOf(g.name) })),
  };
  return [menu, ...nav];
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET/HEAD with a client name; Wikimedia answers 429 to bursts, so it is paced and retried with a growing pause. */
async function fetchPolitely(url, method) {
  const commons = url.startsWith(COMMONS);
  for (let attempt = 0; ; attempt++) {
    if (commons) await pause(1500);
    const res = await fetch(url, { method, headers: { 'User-Agent': 'okr-website-import/1.0' } });
    if (res.status !== 429 || attempt >= 5) return res;
    await pause(5000 * (attempt + 1));
  }
}

async function main() {
  const write = process.argv.includes('--write');
  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  const { getStorage } = rootRequire('firebase-admin/storage');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org', storageBucket: BUCKET });
  const db = getFirestore();
  const bucket = getStorage().bucket(BUCKET);
  const { docs, uploads } = plan();

  // a picture the old site no longer has (its own page links to it, but the server answers 404) is skipped:
  // the group then shows its default icon until an admin uploads the logo in the app
  const missing = new Set();
  for (const [url, path] of uploads) {
    const [exists] = await bucket.file(path).exists();
    if (exists) { console.log(`exists, kept  ${path}`); continue; }
    const res = await fetchPolitely(url, write ? 'GET' : 'HEAD');
    if (!res.ok) { missing.add(path); console.log(`MISSING       ${url} (HTTP ${res.status}) — skipped`); continue; }
    console.log(`${write ? 'uploading    ' : 'would upload '} ${path}`);
    if (!write) continue;
    await bucket.file(path).save(Buffer.from(await res.arrayBuffer()), { contentType: res.headers.get('content-type') ?? undefined, resumable: false });
  }

  for (const [path, data] of docs) {
    if (path.startsWith('avatars/') && missing.has(data.storagePath)) { console.log(`skipped       ${path} (no logo)`); continue; }
    const exists = (await db.doc(path).get()).exists;
    console.log(`${exists ? 'exists, kept ' : write ? 'creating     ' : 'would create '} ${path}`);
    if (!exists && write) await db.doc(path).create(data);
  }

  const sdg = db.doc(`sections/${HOME}_sdg`);
  const sdgNow = (await sdg.get()).data();
  const sdgMissing = [...missing].some((p) => p.startsWith(`tenant/${T}/sdg/`));
  if (sdgMissing) console.log(`kept         sections/${HOME}_sdg (SDG pictures missing — run again)`);
  else if (sdgNow?.type === 'article' && sdgNow?.properties?.images?.[0]?.url?.endsWith('Schriftzug-SDG-klein.jpg')) {
    console.log(`${write ? 'replacing    ' : 'would replace'} sections/${HOME}_sdg (picture article → SDG logo strip)`);
    if (write) await sdg.set(sdgSection());
  }

  const home = db.doc(`pages/${HOME}`);
  const sections = (await home.get()).get('sections') ?? [];
  if (JSON.stringify(sections) === JSON.stringify(SEEDED_HOME)) {
    console.log(`${write ? 'updating     ' : 'would update '} pages/${HOME}.sections → ${NEW_HOME.join(', ')}`);
    if (write) await home.update({ sections: NEW_HOME });
  } else {
    console.log(`kept         pages/${HOME}.sections (edited since the seed: ${sections.join(', ')})`);
  }

  const site = db.doc(`websites/${T}`);
  const s = (await site.get()).data() ?? {};
  const patch = {};
  if (!s.footerSectionKey) patch.footerSectionKey = `${T}_footer`;
  const nav = navWithGroups(s.nav ?? []);
  if (nav !== (s.nav ?? [])) patch.nav = nav;
  if (Object.keys(patch).length > 0) {
    console.log(`${write ? 'updating     ' : 'would update '} websites/${T}: ${Object.keys(patch).join(', ')}`);
    if (write) await site.update({ ...patch, draftChangedAt: new Date().toISOString() });
  } else {
    console.log(`kept         websites/${T} (footer and Projektgruppen menu already set)`);
  }
  if (!write) console.log('Dry run: nothing written. Add --write.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.stack ?? String(e)); process.exit(1); });
}
