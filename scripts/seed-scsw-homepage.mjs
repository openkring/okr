#!/usr/bin/env node
/**
 * seed-scsw-homepage.mjs — creates the CMS page `scsw_homepage` (spec 1.151) for tenant scs.
 *
 * The scs-website homepage renders this page; until it exists the static markup of index.html stays.
 * German goes in the plain fields, English in `properties.*I18n.en`.
 *
 * Texts: the live `websiteContent` docs (tenants ∋ scs, not archived) win; keys without a live doc
 * fall back to the `homeStrings` of apps/scs-website/index.html.
 *
 * Writes (idempotent, fixed ids): 2 image uploads (skipped when present), 7 sections, the page,
 * a `scsw_homepage` menu item (looked up by name) and its prepend to the `cms-website` menu.
 *
 * Usage:
 *   node scripts/seed-scsw-homepage.mjs            dry-run (reads prod, prints every write)
 *   node scripts/seed-scsw-homepage.mjs --apply    performs the writes
 *
 * Requires: gcloud auth application-default login (or GOOGLE_APPLICATION_CREDENTIALS)
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const TENANT = 'scs';
const BUCKET = 'bkaiser-org.appspot.com';
const WEBSITE_MENU_ID = 'cxr388m8e1e6jakzmgw1'; // menuItems/cms-website
const PAGE_ID = 'scsw_homepage';
const POSITION_RIGHT = 4; // ViewPosition.Right

if (!getApps().length) initializeApp({ projectId: 'bkaiser-org', storageBucket: BUCKET });
const db = getFirestore();
const bucket = getStorage().bucket();

// ── texts ────────────────────────────────────────────────────────────────
function loadHomeStrings() {
  const html = fs.readFileSync(path.join(ROOT, 'apps/scs-website/index.html'), 'utf8');
  const m = html.match(/const homeStrings = (\{[\s\S]*?\n    \});/);
  if (!m) throw new Error('homeStrings not found in apps/scs-website/index.html');
  return vm.runInNewContext(`(${m[1]})`);
}

const fallback = loadHomeStrings();
const live = new Map(); // key -> { de, en }
const source = { live: new Set(), fallback: new Set() };

async function loadLive() {
  const snap = await db.collection('websiteContent').where('tenants', 'array-contains', TENANT).get();
  for (const d of snap.docs) {
    const v = d.data();
    if (v.isArchived === true || typeof v.key !== 'string') continue;
    live.set(v.key, { de: v.de, en: v.en });
  }
}

/** [de, en] of a key: live doc first, index.html fallback per language. */
function text(key) {
  const l = live.get(key);
  const pick = (lang) => {
    const v = l?.[lang];
    if (typeof v === 'string' && v.length > 0) { source.live.add(key); return v; }
    const f = fallback[lang]?.[key];
    if (typeof f === 'string') { source.fallback.add(key); return f; }
    throw new Error(`no text for ${key} (${lang})`);
  };
  return { de: pick('de'), en: pick('en') };
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ── shapes ───────────────────────────────────────────────────────────────
const IMAGE_CONFIG = { label: '', type: 0, url: '', actionUrl: '', altText: '', overlay: '', documentKey: '', credit: '' };
const IMAGE_STYLE = {
  imgIxParams: '', width: '100%', height: 'auto', sizes: '(max-width: 1240px) 50vw, 300px', border: '1px solid',
  borderRadius: '4px', isThumbnail: false, slot: 'none', fill: false, hasPriority: false, action: 1, zoomFactor: 2,
  showTitle: false, showSource: false, captionPosition: 'none', captionSize: '0.8rem', captionStyle: 'italic', captionAlign: 'left',
};

function base(id, type, name, title, subTitle, index, properties, content = '<p></p>', contentPosition = 1) {
  return {
    type, state: 'published', name, title, subTitle,
    index: `n:${name} a:${type} k:${id}`,
    color: 'primary', colSize: '12', roleNeeded: 'none', isArchived: false,
    content: { htmlContent: content, colSize: 3, position: contentPosition },
    notes: '', tags: '', tenants: [TENANT],
    properties,
  };
}

const i18n = (t) => ({ en: t.en });

function sections() {
  const hero = {
    kicker: text('hero.kicker'), title: text('hero.title'), sub: text('hero.subtitle'), lead: text('hero.lead'),
    c1: text('hero.cta1'), c2: text('hero.cta2'),
  };
  const about = { kicker: text('about.kicker'), title: text('about.title'), p1: text('about.p1'), p2: text('about.p2') };
  const stats = [1, 2, 3, 4].map((n) => text(`about.stat${n}`));
  const offers = {
    kicker: text('offers.kicker'), title: text('offers.title'), lead: text('offers.lead'), cta: text('offers.cta'),
    items: ['course', 'youth', 'membership'].map((k) => ({ title: text(`offers.${k}.title`), desc: text(`offers.${k}.desc`) })),
  };
  const bh = {
    kicker: text('boathouse.kicker'), title: text('boathouse.title'), lead: text('boathouse.lead'),
    cta: text('boathouse.cta'), caption: text('boathouse.caption'),
  };
  const ev = { kicker: text('events.kicker'), title: text('events.title') };
  const news = { kicker: text('news.kicker'), title: text('news.titleHome') };
  const para = (t) => `<p>${esc(t)}</p>`;
  // The website renderer never appends an arrow to CTA / link labels, so the « →» of the strings stays in the label.

  return {
    scsw_homepage_hero: base('scsw_homepage_hero', 'hero', 'top', hero.title.de, hero.sub.de, 0, {
      logo: { ...IMAGE_CONFIG },
      hero: { ...IMAGE_CONFIG, url: 'tenant/scs/web/hero-sunset.jpg', altText: 'Sonnenuntergang über dem Zürichsee' },
      imageStyle: { ...IMAGE_STYLE },
      kicker: hero.kicker.de,
      kickerI18n: i18n(hero.kicker),
      titleI18n: i18n(hero.title),
      subTitleI18n: i18n(hero.sub),
      contentI18n: { en: para(hero.lead.en) },
      ctas: [
        { label: hero.c1.de, labelI18n: i18n(hero.c1), url: '#kurse', style: 'primary' },
        { label: hero.c2.de, labelI18n: i18n(hero.c2), url: '#ueber-uns', style: 'secondary' },
      ],
    }, para(hero.lead.de)),

    scsw_homepage_about: base('scsw_homepage_about', 'article', 'ueber-uns', about.title.de, '', 1, {
      images: [], imageStyle: { ...IMAGE_STYLE },
      kicker: about.kicker.de, kickerI18n: i18n(about.kicker),
      titleI18n: i18n(about.title),
      contentI18n: { en: para(about.p1.en) + para(about.p2.en) },
      emphasis: 'none',
    }, para(about.p1.de) + para(about.p2.de)),

    scsw_homepage_figures: base('scsw_homepage_figures', 'tiles', 'zahlen', '', '', 2, {
      variant: 'stat', columns: 2,
      items: [['1917', 'primary'], ['250+', 'secondary'], ['3', 'secondary'], ['365', 'primary']].map(([value, tone], i) => ({
        value, title: stats[i].de, titleI18n: i18n(stats[i]), text: '', tone,
      })),
    }),

    scsw_homepage_offers: base('scsw_homepage_offers', 'tiles', 'kurse', offers.title.de, '', 3, {
      variant: 'card', columns: 3,
      kicker: offers.kicker.de, kickerI18n: i18n(offers.kicker),
      titleI18n: i18n(offers.title),
      lead: offers.lead.de, leadI18n: i18n(offers.lead),
      linkLabel: offers.cta.de, linkLabelI18n: i18n(offers.cta),
      items: [
        ['add', 'seite.html?key=scsw_kurs_erwachsene', 'primary'],
        ['people', 'seite.html?key=scsw_kurs_jugendliche', 'primary'],
        ['arrow-forward', 'seite.html?key=scsw_mitgliedschaft', 'secondary'],
      ].map(([icon, url, tone], i) => ({
        icon, url, tone,
        title: offers.items[i].title.de, titleI18n: i18n(offers.items[i].title),
        text: offers.items[i].desc.de, textI18n: i18n(offers.items[i].desc),
      })),
    }),

    scsw_homepage_boathouse: base('scsw_homepage_boathouse', 'article', 'bootshaus', bh.title.de, '', 4, {
      images: [{
        ...IMAGE_CONFIG, url: 'tenant/scs/web/bootshaus-neubau.png',
        altText: bh.caption.de, overlay: bh.caption.de,
      }],
      imageStyle: { ...IMAGE_STYLE, captionPosition: 'bottom-overlay' },
      kicker: bh.kicker.de, kickerI18n: i18n(bh.kicker),
      titleI18n: i18n(bh.title),
      contentI18n: { en: para(bh.lead.en) },
      cta: { label: bh.cta.de, labelI18n: i18n(bh.cta), url: 'bootshaus.html', style: 'primary' },
      emphasis: 'banner',
    }, para(bh.lead.de), POSITION_RIGHT),

    scsw_homepage_events: base('scsw_homepage_events', 'events', 'termine', ev.title.de, '', 5, {
      moreUrl: 'termine.html', maxEvents: 4, showPastEvents: false, showUpcomingEvents: true,
      showEventTime: true, showEventLocation: false,
      kicker: ev.kicker.de, kickerI18n: i18n(ev.kicker), titleI18n: i18n(ev.title),
    }),

    scsw_homepage_news: base('scsw_homepage_news', 'news', 'news', news.title.de, '', 6, {
      moreUrl: 'news.html', showMoreButton: true, maxItems: 3, blogPageKey: 'news_@TID@',
      kicker: news.kicker.de, kickerI18n: i18n(news.kicker), titleI18n: i18n(news.title),
    }),
  };
}

// The caption of the boathouse image: the stored English alt/overlay stays German; titleI18n covers the rest.

// ── writes ───────────────────────────────────────────────────────────────
const log = (...a) => console.log(...a);
async function upload(rel, dest, contentType) {
  const file = bucket.file(dest);
  const [exists] = await file.exists();
  if (exists) { log(`upload ${dest}: present, skipped`); return; }
  log(`upload ${rel} -> gs://${BUCKET}/${dest} (${contentType}, ${fs.statSync(path.join(ROOT, rel)).size} bytes)`);
  if (APPLY) await file.save(fs.readFileSync(path.join(ROOT, rel)), { contentType, resumable: false });
}

async function set(collection, id, data) {
  log(`\n── ${collection}/${id} ──\n${JSON.stringify(data, null, 2)}`);
  if (APPLY) await db.collection(collection).doc(id).set(data);
}

async function main() {
  log(APPLY ? '*** APPLY ***' : '(dry-run: nothing is written; pass --apply to write)');
  await loadLive();
  const secs = sections();

  await upload('apps/scs-website/assets/hero-sunset.jpg', 'tenant/scs/web/hero-sunset.jpg', 'image/jpeg');
  await upload('apps/scs-website/assets/bootshaus-neubau.png', 'tenant/scs/web/bootshaus-neubau.png', 'image/png');

  for (const [id, data] of Object.entries(secs)) await set('sections', id, data);

  const page = {
    name: PAGE_ID, title: 'Seeclub Stäfa', subTitle: '', abstract: '', logoUrl: '', logoAltText: '', bannerUrl: '', bannerAltText: '',
    meta: [], type: 'content', state: 'draft', notes: 'Startseite der Website (Spec 1.151)', tags: '',
    index: `n:${PAGE_ID} a:content k:${PAGE_ID}`,
    // like the other website pages: private + draft; the public API gates on the sections' own state
    isPrivate: true, blogType: 'default', locationKey: '',
    sections: Object.keys(secs), isArchived: false, tenants: [TENANT],
  };
  await set('pages', PAGE_ID, page);

  // menu entry (idempotent by name)
  const existing = await db.collection('menuItems').where('name', '==', 'scsw_homepage').get();
  const mine = existing.docs.find((d) => (d.get('tenants') ?? []).includes(TENANT));
  const menuRef = mine ? mine.ref : db.collection('menuItems').doc();
  const menu = {
    name: 'scsw_homepage', index: `n:scsw_homepage a:navigate k:${menuRef.id}`, action: 'navigate',
    url: '/private/scsw_homepage/c-contentpage', label: '@item.scsw_homepage', icon: 'home',
    data: [], menuItems: [], roleNeeded: 'contentAdmin', tenants: [TENANT], description: '', tags: '', isArchived: false,
  };
  if (mine) log(`\nmenuItems/${menuRef.id}: exists (name scsw_homepage), left untouched`);
  else { log(`\n── menuItems/${menuRef.id} (new) ──\n${JSON.stringify(menu, null, 2)}`); if (APPLY) await menuRef.set(menu); }

  const parent = await db.collection('menuItems').doc(WEBSITE_MENU_ID).get();
  if (!parent.exists) throw new Error(`menuItems/${WEBSITE_MENU_ID} (cms-website) not found`);
  const children = parent.get('menuItems') ?? [];
  if (children.includes('scsw_homepage')) log(`\nmenuItems/${WEBSITE_MENU_ID}.menuItems already has scsw_homepage`);
  else {
    const next = ['scsw_homepage', ...children];
    log(`\nmenuItems/${WEBSITE_MENU_ID}.menuItems (${parent.get('name')}) = ${JSON.stringify(next)}`);
    if (APPLY) await parent.ref.update({ menuItems: next });
  }

  log(`\ntexts from live websiteContent (${source.live.size}): ${[...source.live].sort().join(', ')}`);
  log(`texts from index.html fallback (${source.fallback.size}): ${[...source.fallback].sort().join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
