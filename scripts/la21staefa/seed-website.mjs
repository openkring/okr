#!/usr/bin/env node
/**
 * Seeds the LA21 Stäfa website skeleton (spec 1.165 §6, plan Task 12): websites/la21staefa and the
 * home page la21staefa_home with a hero, the «Verein» intro, a button to the membership, the next
 * public events and the news. Dry run by default; --write creates only documents that do not exist
 * yet (never overwrites content someone has started to edit). Run once; the rest of the page tree
 * is built in the app (Website › Sitemap) and by «Auf der Website zeigen» on each group.
 *
 *   node scripts/la21staefa/seed-website.mjs [--write]
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const { getApps, initializeApp } = rootRequire('firebase-admin/app');
const { getFirestore } = rootRequire('firebase-admin/firestore');

const T = 'la21staefa';
const HOME = `${T}_home`;
const IMAGE = { actionUrl: '', altText: '', credit: '', documentKey: '', label: '', overlay: '', type: 0, url: '' };

const section = (key, type, title, properties = {}, extra = {}) => ({
  name: key, type, state: 'published', roleNeeded: 'public', colSize: '12', color: 0, title, subTitle: '',
  notes: 'LA21 Website-Grundgerüst (1.165)', content: { htmlContent: '', colSize: 3, position: 1 },
  properties, tags: '', isArchived: false, tenants: [T], index: `n:${key} a:${type} k:${key}`, ...extra,
});

export const SECTIONS = {
  [`${HOME}_hero`]: section('top', 'hero', 'Der Verein für Nachhaltigkeit in Stäfa',
    { hero: IMAGE, logo: IMAGE, gradient: { from: '#723973', to: '#bcbe1f' } },
    { subTitle: 'Seit 2001 setzt sich die LA21 mit ihren Projekten für gesellschaftliche Solidarität, ökologische Verantwortung und wirtschaftliche Leistungsfähigkeit ein.' }),
  [`${HOME}_verein`]: section('verein', 'article', 'Die LA21 Projektgruppen', { images: [] }, {
    content: { colSize: 3, position: 0, htmlContent: '<p>Der Verein LA21 funktioniert als Projektholding. Er unterstützt die Projektgruppen bei der Vernetzung, Finanzierung, Administration und Kommunikation. Der Kernvorstand leitet den Verein und steht den Projektgruppen beratend zur Verfügung.</p><p>Die Projektgruppen bestehen aus Teams, die weitgehend selbständig arbeiten. Mitmachen steht allen offen, auch ohne Mitgliedschaft im Verein.</p>' },
  }),
  [`${HOME}_events`]: section('all', 'events', 'Nächste Termine', { maxEvents: 5, moreUrl: '/termine', showPastEvents: false, showUpcomingEvents: true, showEventTime: true, showEventLocation: true }),
  [`${HOME}_news`]: section('news', 'news', 'Neuigkeiten', { maxItems: 3, moreUrl: '/news', showMoreButton: true, blogPageKey: 'news_@TID@' }),
};

export const PAGE = {
  name: HOME, title: 'Lokale Agenda 21 Stäfa', type: 'content', state: 'published', isPrivate: false,
  sections: Object.keys(SECTIONS), tenants: [T], isArchived: false, index: `n:${HOME} a:content k:${HOME}`,
  abstract: '', notes: 'LA21 Website-Startseite (1.165)', tags: '', meta: [],
};

/** The news blog the news sections and publicApi /news read (news_<tenant>); articles are added in the app. */
export const NEWS_PAGE = {
  name: 'News', title: 'Neuigkeiten', type: 'blog', blogType: 'classic', state: 'published', isPrivate: false,
  sections: [], tenants: [T], isArchived: false, index: `n:News a:blog k:news_${T}`, abstract: '', notes: '', tags: '', meta: [],
};

export const SITE = {
  name: 'Lokale Agenda 21 Stäfa Website', tenants: [T], isArchived: false,
  hostingSite: 'la21staefa-website-54aef', domain: 'https://la21staefa-website-54aef.web.app',
  languages: ['de'], templateVersion: '', tagline: 'Der Verein für Nachhaltigkeit in Stäfa – seit 2001.',
  nav: [
    { id: 'n-termine', type: 'link', label: 'Termine', url: '/termine' },
    { id: 'n-news', type: 'link', label: 'News', url: '/news' },
    { id: 'n-login', type: 'link', label: 'Login', url: 'https://la21staefa-app-54aef.web.app/', style: 'button' },
  ],
  footer: [
    { id: 'f-verein', type: 'menu', label: 'Verein', children: [
      { id: 'f-termine', type: 'link', label: 'Termine', url: '/termine' },
      { id: 'f-news', type: 'link', label: 'News', url: '/news' },
    ] },
  ],
  homePageKey: HOME,
};

async function main() {
  const write = process.argv.includes('--write');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();
  const docs = [
    ...Object.entries(SECTIONS).map(([k, v]) => [`sections/${k}`, v]),
    [`pages/${HOME}`, PAGE],
    [`pages/news_${T}`, NEWS_PAGE],
    [`websites/${T}`, SITE],
  ];
  for (const [path, data] of docs) {
    const exists = (await db.doc(path).get()).exists;
    console.log(`${exists ? 'exists, kept ' : write ? 'creating     ' : 'would create '} ${path}`);
    if (!exists && write) await db.doc(path).create(data);
  }
  if (!write) console.log('Dry run: nothing written. Add --write.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.code ?? e.message); process.exit(1); });
}
