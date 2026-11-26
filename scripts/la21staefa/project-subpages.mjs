#!/usr/bin/env node
/**
 * Sub-projects of the la21staefa project groups get their own pages and menu entries, as on www.la21staefa.ch
 * (owner, 2026-11-26). The import had put each old sub-page onto its project's page (BTVZ: KreisWERK and two
 * event pages; SMäRT: KofferSMäRT; StäfNet: Musigtäg) or dropped it from the list (Begegnung & Integration:
 * Nettswerk Treff). Qatira is a group of its own but belongs under Begegnung & Integration in the menus.
 *
 *   node scripts/la21staefa/project-subpages.mjs            # dry run: prints what it would write
 *   node scripts/la21staefa/project-subpages.mjs --write
 *
 * - Creates `pages/<key>` per sub-project (create-only). Its sections are the imported sections, referenced by
 *   key — nothing is copied or renamed. The old sub-page's title section is left out (the page header shows the
 *   title). A run of questions becomes an accordion like on the other project pages (page-accordions.mjs).
 * - Removes the moved sections from the project page — only while all of them are still in its list
 *   (an edited list is reported and left alone).
 * - Website `websites/la21staefa`: under «Projektgruppen» a project with sub-projects becomes a menu whose own url
 *   is the project page (the project page node stays its first child, the template hides it in the flyout).
 * - App: a «Projektgruppen» submenu (`la21staefa-projekte`) in `main_la21staefa` after «Verein», one row per
 *   project, a submenu per project with sub-projects (first row = the project page).
 * Idempotent: every step checks for its own result first.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertNoBlocksIn } from '../lib/block-article-guard.mjs';
import { accordionSection } from './page-accordions.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const T = 'la21staefa';

const BI = `${T}_begegnungintegr_content`;
const BTVZ = `${T}_btvzbauteilezur_content`;
const SMART = `${T}_smart_content`;
const STAFNET = `${T}_stafnet_content`;
const s = (page, ...ns) => ns.map((n) => `${page}_s${String(n).padStart(2, '0')}`);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * project page → its sub-projects in menu order. `sections`: the page's section list, where `{ accordion }` is a
 * new accordion over the given sections. `moved`: the sections that leave the project page. `pageKey` set and no
 * `sections` = an existing page (Qatira).
 */
export const PROJECTS = [
  {
    page: BI, slug: 'begegnung-und-integration', label: 'Begegnung & Integration',
    subs: [
      {
        key: `${T}_nettswerktreff`, slug: 'nettswerk-treff', label: 'Nettswerk Treff', title: 'Nettswerk Treff',
        subTitle: 'Und wie engagieren Sie sich freiwillig für Geflüchtete?',
        // s01 = the old page title, s02 = its teaser (now the subtitle)
        sections: [...s(BI, 3, 4), { accordion: `${T}_nettswerktreff_accordion`, notes: 'Details zum Projekt Nettswerk Treff', items: s(BI, ...range(5, 11)) }, ...s(BI, 12, 13, 14, 15)],
        moved: [],
      },
      { key: `${T}_qatira_content`, slug: 'qatira', label: 'Qatira', existing: true },
    ],
  },
  {
    page: BTVZ, slug: 'btvz-bauteile-zurichsee', label: 'BTVZ Bauteile Zürichsee',
    subs: [
      {
        key: `${T}_kreiswerk`, slug: 'kreiswerk', label: 'KreisWERK', title: 'KreisWERK', subTitle: '',
        sections: [...s(BTVZ, 17, 18, 19, 20), { accordion: `${T}_kreiswerk_accordion`, notes: 'Details zu KreisWERK', items: s(BTVZ, 21, 22, 23) }, ...s(BTVZ, 24, 25, 26)],
        moved: s(BTVZ, ...range(16, 26)),
      },
      {
        key: `${T}_kreiswerk_veranstaltung`, slug: 'wiederverwenden-im-oeffentlichen-bau', label: 'Veranstaltung Wiederverwenden im öffentlichen Bau',
        title: 'Veranstaltung Wiederverwenden im öffentlichen Bau', subTitle: '',
        sections: s(BTVZ, 37, 38, 39, 40), moved: s(BTVZ, ...range(36, 40)),
      },
      {
        key: `${T}_kreiswerk_rueckblick`, slug: 'rueckblick-kreislaufwirtschaft', label: 'Rückblick Veranstaltung Kreislaufwirtschaft',
        title: 'Rückblick Veranstaltung Kreislaufwirtschaft', subTitle: '',
        sections: s(BTVZ, ...range(28, 35)), moved: s(BTVZ, ...range(27, 35)),
      },
    ],
  },
  {
    page: SMART, slug: 'smart', label: 'SMäRT',
    subs: [
      {
        key: `${T}_koffersmart`, slug: 'koffersmart', label: 'Anmeldung zum KofferSMäRT 2026', title: 'Anmeldung zum KofferSMäRT 2026', subTitle: '',
        sections: s(SMART, 48), moved: s(SMART, 47, 48),
      },
    ],
  },
  {
    page: STAFNET, slug: 'stafnet', label: 'StäfNet',
    subs: [
      {
        key: `${T}_musigtag`, slug: 'stafner-musigtag', label: 'Stäfner Musigtäg', title: 'Stäfner Musigtäg', subTitle: '',
        sections: s(STAFNET, ...range(18, 23)), moved: s(STAFNET, ...range(17, 23)),
      },
    ],
  },
];

/** The page document of a sub-project; `sectionKeys` = its section list with accordions as their keys. */
export function subPage(sub) {
  const sections = sub.sections.map((x) => (typeof x === 'string' ? x : x.accordion));
  return {
    name: sub.title, title: sub.title, subTitle: sub.subTitle, type: 'content', state: 'published', isPrivate: false,
    sections, tenants: [T], isArchived: false, index: `n:${sub.title} a:content k:${sub.key}`,
    abstract: '', notes: 'LA21 Unterprojekt, eigene Seite wie auf www.la21staefa.ch (2026-11-26)', tags: '', meta: [],
  };
}

/** The project page's section list without the moved sections; null when they no longer all stand in it. */
export function withoutMoved(current, moved) {
  if (!moved.length || moved.every((k) => !current.includes(k))) return current; // nothing (left) to do
  if (!moved.every((k) => current.includes(k))) return null;
  return current.filter((k) => !moved.includes(k));
}

const pageNode = (id, label, pageKey, slug) => ({ id, type: 'page', label, pageKey, slug });

/**
 * The website nav with the project menus: under «Projektgruppen» each project with sub-projects becomes a menu
 * (own url = the project page, first child = the existing project page node); Qatira moves under Begegnung.
 */
export function navWithSubprojects(nav) {
  return nav.map((top) => {
    if (top.id !== 'n-projektgruppen') return top;
    const subKeys = new Set(PROJECTS.flatMap((p) => p.subs.map((x) => x.key)));
    let children = top.children ?? [];
    const taken = new Map(children.filter((c) => c.type === 'page' && subKeys.has(c.pageKey)).map((c) => [c.pageKey, c]));
    children = children.filter((c) => !(c.type === 'page' && subKeys.has(c.pageKey)));
    children = children.map((c) => {
      const project = c.type === 'page' && PROJECTS.find((p) => p.page === c.pageKey);
      if (!project) return c;
      return {
        id: `${c.id}-menu`, type: 'menu', label: c.label, url: `/${c.slug}`,
        children: [c, ...project.subs.map((x) => taken.get(x.key) ?? pageNode(`n-${x.slug}`, x.label, x.key, x.slug))],
      };
    });
    return { ...top, children };
  });
}

const menuDoc = (name, label, action, url, menuItems, description, icon) => ({
  name, label, action, url, roleNeeded: 'public', icon, data: [], menuItems, description, isArchived: false, tags: '',
  tenants: [T], index: `n:${name} a:${action} k:${name}`,
});
const appUrl = (pageKey) => `/public/${pageKey}/c-contentpage`;

/** The app menu documents (doc id = name), the website's «Projektgruppen» tree mirrored. */
export function appMenus(nav) {
  const docs = [];
  const top = nav.find((n) => n.id === 'n-projektgruppen');
  const rows = [];
  for (const c of top?.children ?? []) {
    if (c.isArchived) continue;
    const project = PROJECTS.find((p) => p.page === (c.type === 'page' ? c.pageKey : c.children?.[0]?.pageKey));
    const page = c.type === 'page' ? c : c.children[0];
    const row = page.pageKey === `${T}_projektgruppen` ? 'la21staefa-pg-uebersicht' : `la21staefa-pg-${page.slug}`;
    if (!project) {
      docs.push(menuDoc(row, page.label, 'navigate', appUrl(page.pageKey), [], `Projektgruppe ${page.label}`, 'group'));
      rows.push(row);
      continue;
    }
    const children = [];
    for (const n of c.children ?? [page]) {
      const name = `la21staefa-pg-${n.slug}`;
      docs.push(menuDoc(name, n.label, 'navigate', appUrl(n.pageKey), [], n === page ? `Projektgruppe ${n.label}` : `Unterprojekt von ${page.label}`, 'group'));
      children.push(name);
    }
    docs.push(menuDoc(`la21staefa-pg-${page.slug}-menu`, page.label, 'sub', '', children, `${page.label} mit Unterprojekten`, 'group'));
    rows.push(`la21staefa-pg-${page.slug}-menu`);
  }
  docs.push(menuDoc('la21staefa-projekte', 'Projektgruppen', 'sub', '', rows, 'Die Projektgruppen und ihre Unterprojekte', 'people-group'));
  return docs;
}

export const ROOT_MENU = `main_${T}`;
/** the root's rows with «Projektgruppen» after «Verein» (or appended) */
export function rootWithProjects(items) {
  if (items.includes('la21staefa-projekte')) return items;
  const at = items.indexOf('la21staefa-verein');
  return at < 0 ? [...items, 'la21staefa-projekte'] : [...items.slice(0, at + 1), 'la21staefa-projekte', ...items.slice(at + 1)];
}

async function main() {
  const write = process.argv.includes('--write');
  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();
  const say = (verb, what) => console.log(`${write ? verb.padEnd(13) : `would ${verb}`.padEnd(19)} ${what}`);

  // 1. sub-project pages and their accordions
  const accordions = PROJECTS.flatMap((p) => p.subs).flatMap((x) => (x.sections ?? []).filter((y) => typeof y !== 'string'));
  await assertNoBlocksIn(db, accordions.map((a) => a.accordion));
  for (const sub of PROJECTS.flatMap((p) => p.subs)) {
    if (sub.existing) continue;
    for (const key of sub.sections.flatMap((x) => (typeof x === 'string' ? [x] : x.items))) {
      if (!(await db.doc(`sections/${key}`).get()).exists) throw new Error(`sections/${key} missing`);
    }
    for (const a of sub.sections.filter((x) => typeof x !== 'string')) {
      const ref = db.doc(`sections/${a.accordion}`);
      if ((await ref.get()).exists) { console.log(`exists, kept       sections/${a.accordion}`); continue; }
      const items = [];
      for (const key of a.items) items.push({ key, label: (await db.doc(`sections/${key}`).get()).get('title') ?? '', value: key });
      say('create', `sections/${a.accordion} (${items.map((i) => i.label).join(' · ')})`);
      if (write) await ref.create(accordionSection(a.accordion, a.notes, items));
    }
    const ref = db.doc(`pages/${sub.key}`);
    if ((await ref.get()).exists) { console.log(`exists, kept       pages/${sub.key}`); continue; }
    const page = subPage(sub);
    say('create', `pages/${sub.key} «${sub.title}»: ${page.sections.join(', ')}`);
    if (write) await ref.create(page);
  }

  // 2. the moved sections leave the project pages
  for (const p of PROJECTS) {
    const ref = db.doc(`pages/${p.page}`);
    const current = (await ref.get()).get('sections') ?? [];
    const moved = p.subs.flatMap((x) => x.moved ?? []);
    const next = withoutMoved(current, moved);
    if (next === null) { console.log(`EDITED, left alone pages/${p.page}: not all of ${moved.join(', ')} are in its list`); continue; }
    if (next === current) { console.log(`unchanged          pages/${p.page}`); continue; }
    say('update', `pages/${p.page}.sections → ${next.join(', ')}`);
    if (write) await ref.update({ sections: next });
  }

  // 3. website nav
  const site = db.doc(`websites/${T}`);
  const nav = (await site.get()).get('nav') ?? [];
  const newNav = navWithSubprojects(nav);
  if (JSON.stringify(newNav) === JSON.stringify(nav)) console.log(`unchanged          websites/${T}.nav`);
  else {
    say('update', `websites/${T}.nav`);
    for (const c of newNav.find((n) => n.id === 'n-projektgruppen').children) {
      console.log(`    ${c.label}${c.type === 'menu' ? ` → ${c.children.slice(1).map((x) => x.label).join(', ')}` : ''}`);
    }
    if (write) await site.update({ nav: newNav, draftChangedAt: new Date().toISOString() });
  }

  // 4. app menu
  for (const doc of appMenus(newNav)) {
    const ref = db.doc(`menuItems/${doc.name}`);
    if ((await ref.get()).exists) { console.log(`exists, kept       menuItems/${doc.name}`); continue; }
    say('create', `menuItems/${doc.name} (${doc.action}${doc.url ? ` ${doc.url}` : ` [${doc.menuItems.join(', ')}]`})`);
    if (write) await ref.create(doc);
  }
  const root = db.doc(`menuItems/${ROOT_MENU}`);
  const items = (await root.get()).get('menuItems') ?? [];
  const nextItems = rootWithProjects(items);
  if (nextItems === items) console.log(`unchanged          menuItems/${ROOT_MENU}`);
  else {
    say('update', `menuItems/${ROOT_MENU}.menuItems → ${nextItems.join(', ')}`);
    if (write) await root.update({ menuItems: nextItems });
  }
  if (!write) console.log('\nDry run — nothing written. Pass --write.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.stack ?? String(e)); process.exit(1); });
}
