#!/usr/bin/env node
/**
 * Links in the imported la21staefa content that still point at pages of the old WordPress site (www.la21staefa.ch)
 * are pointed at the new website pages (owner, 2026-11-26). Files under /wp-content/uploads/ are left alone: they
 * are documents, not pages, and still served by the old site.
 *
 *   node scripts/la21staefa/fix-old-links.mjs [--origin=https://…]            # dry run
 *   node scripts/la21staefa/fix-old-links.mjs [--origin=https://…] --write
 *
 * Target = `<origin>/<slug>`, origin = `websites/la21staefa.domain` (or --origin). Absolute on purpose: the same
 * sections are shown in the app, where a relative `/slug` would be an app route. When the website moves to its
 * own domain, run again with the old origin in OLD_ORIGINS… or simply with --origin: links already on the
 * current website origin are rewritten to the new one.
 * Every string of a section is rewritten (htmlContent and the article blocks carry the same links).
 * - a page of the old site → the new page
 * - a link whose target no longer exists anywhere (404 on the old site too) → the anchor is removed, its text kept
 * - a mail address written as a page path → mailto:
 * Links the script does not know are listed at the end and left alone.
 */
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootRequire = createRequire(join(ROOT, 'package.json'));
const T = 'la21staefa';
const OLD = 'https://www.la21staefa.ch';

/** old path (without host) → new website slug, checked against the old site on 2026-11-26 */
export const PAGE_MAP = {
  '/btvz-start/baukreis-rueckblick/': 'rueckblick-kreislaufwirtschaft',
  '/btvz-start/baukreis/': 'rueckblick-kreislaufwirtschaft', // the old site redirects it to the Rückblick
  '/btvz-start/kreiswerk/': 'kreiswerk',
  '/btvz-start/veranstaltung-wiederverwenden-im-bau/': 'wiederverwenden-im-oeffentlichen-bau',
  '/kiss/kiss-staefa-zeitguthaben/': 'kiss-stafa', // 404 on the old site; the topic is KISS Stäfa
  '/nettswerk-treff/': 'nettswerk-treff',
  '/projektgruppenuebersicht/': 'projektgruppen',
  '/qatira/': 'qatira',
  '/staefnet/': 'stafnet',
};
/** old path → a fixed target (the old site redirects the page to this document) */
export const FIXED = {
  '/jahresbericht-2025-qatira/': `${OLD}/wp-content/uploads/2026/04/Jahresbericht-2025-Qatira.pdf`,
  '/smaert/sodabags@gmx.ch': 'mailto:sodabags@gmx.ch',
};
/** old path prefixes whose target exists nowhere: the anchor goes, its text stays */
export const DEAD = ['/uploads/files/Merkblatt-FW-engagiert-Kopie.pdf'];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const OLD_HOST = /https?:\/\/(?:www\.)?la21staefa\.ch/;

/** One string with its old page links rewritten; `unknown` collects old links the maps do not cover. */
export function rewrite(text, origin, unknown = new Set(), otherOrigins = []) {
  let out = text;
  for (const dead of DEAD) {
    const url = `${OLD_HOST.source}${escapeRe(dead)}[^"\\\\]*`;
    out = out.replace(new RegExp(`<a\\s[^>]*href=(\\\\?)"${url}\\1"[^>]*>([\\s\\S]*?)</a>`, 'g'), '$2');
  }
  const hosts = [OLD_HOST.source, ...otherOrigins.map(escapeRe)].join('|');
  out = out.replace(new RegExp(`(?:${hosts})(/[^"'\\s<>\\\\)]*)`, 'g'), (whole, path) => {
    if (FIXED[path]) return FIXED[path];
    const slug = PAGE_MAP[path] ?? (otherOrigins.some((o) => whole.startsWith(o)) ? path.slice(1) : undefined);
    if (slug !== undefined) return `${origin}/${slug}`;
    if (!path.startsWith('/wp-content/')) unknown.add(whole);
    return whole;
  });
  return out;
}

/** a deep copy of `value` with every string rewritten */
export function rewriteDeep(value, origin, unknown, otherOrigins) {
  if (typeof value === 'string') return rewrite(value, origin, unknown, otherOrigins);
  if (Array.isArray(value)) return value.map((v) => rewriteDeep(v, origin, unknown, otherOrigins));
  if (value && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteDeep(v, origin, unknown, otherOrigins)]));
  }
  return value;
}

async function main() {
  const write = process.argv.includes('--write');
  const originArg = process.argv.find((a) => a.startsWith('--origin='))?.slice('--origin='.length);
  const { getApps, initializeApp } = rootRequire('firebase-admin/app');
  const { getFirestore } = rootRequire('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: 'bkaiser-org' });
  const db = getFirestore();

  const domain = String((await db.doc(`websites/${T}`).get()).get('domain') ?? '').replace(/\/$/, '');
  const origin = (originArg ?? domain).replace(/\/$/, '');
  if (!/^https:\/\/[^/]+$/.test(origin) || OLD_HOST.test(origin)) throw new Error(`origin «${origin}» is not a new https origin`);
  const otherOrigins = domain && domain !== origin ? [domain] : []; // a move: links on the current origin follow

  const unknown = new Set();
  let changed = 0;
  const snap = await db.collection('sections').where('tenants', 'array-contains', T).get();
  for (const doc of snap.docs) {
    const data = doc.data();
    const patch = {};
    for (const field of ['content', 'properties', 'title', 'subTitle']) {
      if (data[field] === undefined) continue;
      const next = rewriteDeep(data[field], origin, unknown, otherOrigins);
      if (JSON.stringify(next) !== JSON.stringify(data[field])) patch[field] = next;
    }
    if (!Object.keys(patch).length) continue;
    changed++;
    const before = JSON.stringify(data).match(new RegExp(`(?:${OLD_HOST.source})/(?!wp-content/)[^"\\\\]*`, 'g')) ?? [];
    console.log(`${write ? 'update' : 'would update'}  sections/${doc.id} (${Object.keys(patch).join(', ')}): ${[...new Set(before)].join(' ')}`);
    if (write) await doc.ref.update(patch);
  }
  console.log(`\n${changed} section(s) ${write ? 'updated' : 'to update'}; target origin ${origin}`);
  if (unknown.size) console.log(`left alone (no mapping):\n  ${[...unknown].join('\n  ')}`);
  if (!write) console.log('Dry run — nothing written. Pass --write.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((e) => { console.error(e.stack ?? String(e)); process.exit(1); });
}
