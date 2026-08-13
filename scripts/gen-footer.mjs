#!/usr/bin/env node
/**
 * Inline the shared site footer into the built HTML pages of a static site.
 *
 * WHY THIS EXISTS
 * ---------------
 * kring-website is plain static HTML with no templating engine, so its footer was
 * copy-pasted into all 13 pages — and drifted: 4 of them had silently lost the
 * "basierend auf openkring" branding. One source of truth, stitched in at build time.
 *
 * Build time, NOT runtime: the alternative (inject with JS, like scs-website's
 * shared.js) makes the imprint, AGB and privacy links invisible without JavaScript,
 * which is exactly backwards for the links that are legally required to be findable.
 * The output is plain HTML.
 *
 * Runs on `dist/` only — the source pages keep the `<!--#footer-->` marker, so
 * `nx serve` (which serves the sources unbuilt) shows no footer in local dev.
 *
 * USAGE
 * -----
 *   node scripts/gen-footer.mjs kring-website
 */

import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MARKER = '<!--#footer-->';

const site = process.argv[2];
if (!site) {
  console.error('usage: node scripts/gen-footer.mjs <site>   (e.g. kring-website)');
  process.exit(1);
}

const partial = join(ROOT, 'apps', site, 'assets/_footer.html');
const dist = join(ROOT, 'dist/apps', site);
if (!existsSync(partial)) {
  console.error(`✖ missing partial apps/${site}/assets/_footer.html`);
  process.exit(1);
}
if (!existsSync(dist)) {
  console.error(`✖ missing dist/apps/${site} — build the site first`);
  process.exit(1);
}

const footer = readFileSync(partial, 'utf8').trim();
const pages = readdirSync(dist).filter(f => f.endsWith('.html'));
const missing = [];

for (const page of pages) {
  const file = join(dist, page);
  const html = readFileSync(file, 'utf8');
  if (!html.includes(MARKER)) {
    missing.push(page);
    continue;
  }
  writeFileSync(file, html.split(MARKER).join(footer));
}

// The partial is not a page; it must not be publicly served.
rmSync(join(dist, 'assets/_footer.html'), { force: true });

if (missing.length) {
  console.error(`✖ ${missing.length} page(s) without a ${MARKER} marker: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`  footer inlined into ${pages.length} page(s) of ${site}`);
