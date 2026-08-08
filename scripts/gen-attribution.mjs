#!/usr/bin/env node
/**
 * Generate the third-party OSS attribution page (`licenses.html`) for every deployable.
 *
 * WHY THIS EXISTS
 * ---------------
 * MIT, Apache-2.0, BSD and OFL all require the license text and copyright notice to
 * travel with distributed software — a web app included. We shipped nothing of the sort.
 *
 * This is an ASSEMBLER, not a license scanner. The Angular production build already
 * emits `dist/apps/<app>/3rdpartylicenses.txt` (`extractLicenses` defaults to true):
 * every package that is *actually bundled*, with its full license text. That is far more
 * accurate than walking the dependency tree — `pnpm licenses list --prod` reports 877
 * packages for a bundle that contains 121, because it counts vite, esbuild, tailwind and
 * every other build-time tool that never reaches a browser.
 *
 * So the job is to take that file and fill the three gaps it cannot know about:
 *   1. self-hosted fonts (not npm packages — OFL requires the license to travel along)
 *   2. the static websites, which have no bundler at all
 *   3. the Cloud Functions dependencies
 *
 * OUTPUT GOES TO `dist/` ONLY — never the source tree. `3rdpartylicenses.txt` does not
 * exist until *after* the app build, but `apps/scs-website/` is copied *into* the app
 * during that build; writing into the source tree would need two passes. The consequence
 * is that `nx serve` has no such page and the imprint links 404 in local dev.
 *
 * The license policy check REPORTS and never fails a build. Deciding what to do about an
 * LGPL or Unknown dependency is a human call, not something a release step should block.
 *
 * See planning/specs/2026-07-19-oss-license-attribution-spec.md
 *
 * USAGE
 * -----
 *   node scripts/gen-attribution.mjs                  # all targets
 *   node scripts/gen-attribution.mjs scs-app          # named targets only
 *   node scripts/gen-attribution.mjs --check          # summary only, writes nothing
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Each target composes from four collectors. `scs-website` has no target of its own —
 * it is embedded into `scs-app` at `./web`, so the scs-app page covers both. `p13-website`
 * IS standalone (it is not embedded into p13-app) and therefore has one.
 */
const TARGETS = {
  'scs-app': {
    label: 'Seeclub Stäfa',
    bundle: 'dist/apps/scs-app/3rdpartylicenses.txt',
    selfHostedFonts: 'apps/scs-website/assets/fonts',
    serverDeps: true,
    // NOTE the `browser/` segment: firebase.json serves `dist/apps/<app>/browser`, so anything
    // written one level up is built but never deployed — which is exactly why the Angular-emitted
    // `dist/apps/<app>/3rdpartylicenses.txt` has never actually reached a user.
    out: 'dist/apps/scs-app/browser/web/licenses.html',
  },
  'p13-app': {
    label: 'P13',
    bundle: 'dist/apps/p13-app/3rdpartylicenses.txt',
    serverDeps: true,
    out: 'dist/apps/p13-app/browser/licenses.html',
  },
  'kring-website': {
    label: 'Kring',
    // self-hosted since 2026-08-04 (spec C6, defect W6) — the OFL text must travel with the files
    selfHostedFonts: 'apps/kring-website/assets/fonts',
    vendored: 'apps/kring-website/assets',
    out: 'dist/apps/kring-website/licenses.html',
  },
  'okr-website': {
    label: 'openkring',
    selfHostedFonts: 'apps/okr-website/assets/fonts',
    out: 'dist/apps/okr-website/licenses.html',
  },
  'p13-website': {
    label: 'P13',
    // self-hosted since 2026-08-08 (spec C6, defect W6) — the OFL text must travel with the files
    selfHostedFonts: 'apps/p13-website/assets/fonts',
    out: 'dist/apps/p13-website/licenses.html',
  },
};

/** Permissive / attribution-only licenses. Anything else is reported, not blocked. */
const ALLOWED = new Set(['0BSD', 'Apache-2.0', 'BlueOak-1.0.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC-BY-3.0', 'CC-BY-4.0', 'CC0-1.0', 'ISC', 'MIT', 'MIT-0', 'MIT/X11', 'OFL-1.1', 'Python-2.0', 'Unlicense', '(Apache-2.0 AND BSD-3-Clause)', '(MIT AND Zlib)', '(MIT OR CC0-1.0)']);

// ---------------------------------------------------------------------------- collectors

/**
 * Parse the Angular-emitted attribution file. Blocks are separated by a rule of dashes and
 * open with `Package:` / `License:` lines; everything after them is the verbatim text.
 */
function collectBundle(relPath) {
  const file = join(ROOT, relPath);
  if (!existsSync(file)) {
    throw new Error(`missing ${relPath} — build the app first (pnpm nx build <app> --configuration production).\n` + `    If the build ran but the file is absent, "extractLicenses" was turned off in project.json.`);
  }
  const entries = [];
  for (const block of readFileSync(file, 'utf8').split(/^-{10,}$/m)) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    // The trailing newline is optional: ~20 packages declare a license id but ship no
    // LICENSE file, so their block is the two header lines and nothing else.
    const head = /^Package:\s*(.+)\r?\nLicense:\s*"?([^"\n]*?)"?(?:\r?\n|$)/.exec(trimmed);
    if (!head) continue;
    entries.push({
      name: head[1].trim(),
      license: head[2].trim() || 'Unknown',
      text: trimmed.slice(head[0].length).trim(),
    });
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

/** Self-hosted font files ship the actual bytes, so the full license text must ship too. */
function collectLicenseDir(relDir) {
  const dir = join(ROOT, relDir);
  if (!existsSync(dir)) throw new Error(`missing license directory ${relDir}`);
  return readdirSync(dir)
    .filter(f => /^LICENSE.*\.txt$/i.test(f))
    .sort()
    .map(f => {
      const text = readFileSync(join(dir, f), 'utf8').trim();
      const name = f
        .replace(/^LICENSE[-_]?/i, '')
        .replace(/\.txt$/i, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2');
      return { name, license: detectLicenseId(text), text };
    });
}

function detectLicenseId(text) {
  if (/SIL OPEN FONT LICENSE\s+Version 1\.1/i.test(text)) return 'OFL-1.1';
  if (/Apache License[\s\S]{0,120}Version 2\.0/i.test(text)) return 'Apache-2.0';
  if (/\bMIT License\b/i.test(text)) return 'MIT';
  return 'Unknown';
}

/**
 * Cloud Functions run on our servers and are never distributed, so no license compels a
 * notice here. Listed anyway (id + version, no full texts) because it costs nothing and
 * puts every flagged dependency on one page. `@types/*` are compile-time only — skipped.
 */
function collectServerDeps() {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'apps/functions/package.json'), 'utf8'));
  const declared = Object.entries(manifest.dependencies ?? {}).filter(([name]) => !name.startsWith('@types/'));
  return declared
    .map(([name, range]) => {
      const found = ['apps/functions/node_modules', 'node_modules'].map(base => join(ROOT, base, name, 'package.json')).find(existsSync);
      if (!found) return { name, version: range, license: 'Unknown', unresolved: true };
      const pkg = JSON.parse(readFileSync(found, 'utf8'));
      const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map(l => l.type).join(' OR ') : '');
      return { name, version: pkg.version ?? range, license: license || 'Unknown' };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------------------ rendering

const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Deliberately self-contained (inline CSS): scs-website is Tailwind-built while the other
 * sites use inline styles, and one shared page must not straddle both styling systems.
 */
function renderPage(target, sections) {
  const style = `
:root { color-scheme: light dark; --fg:#1a1815; --muted:#6b6b6b; --bg:#fff; --line:#e5e5e5; --code:#f6f6f6; }
@media (prefers-color-scheme: dark) {
  :root { --fg:#e8e6e3; --muted:#9a9a9a; --bg:#111214; --line:#2a2c30; --code:#191a1d; }
}
* { box-sizing: border-box; }
body { margin:0; padding:0 1.25rem 5rem; background:var(--bg); color:var(--fg);
  font:16px/1.6 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif; }
main { max-width: 52rem; margin: 0 auto; }
h1 { font-size:1.9rem; margin:2.5rem 0 .5rem; letter-spacing:-.02em; }
h2 { font-size:1.3rem; margin:3rem 0 .25rem; letter-spacing:-.01em;
  border-top:1px solid var(--line); padding-top:2rem; }
h3 { font-size:1rem; margin:2rem 0 .25rem; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
p { margin:.5rem 0; } .lede, .note { color:var(--muted); font-size:.9rem; }
a { color:inherit; }
nav ul { list-style:none; padding:0; margin:1rem 0 0; }
nav li { margin:.15rem 0; }
table { width:100%; border-collapse:collapse; margin:1rem 0; font-size:.9rem; }
th, td { text-align:left; padding:.4rem .75rem .4rem 0; border-bottom:1px solid var(--line);
  vertical-align:top; }
th { color:var(--muted); font-weight:600; }
td.pkg { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
pre { background:var(--code); border:1px solid var(--line); border-radius:6px; padding:1rem;
  overflow-x:auto; font-size:.8rem; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
.badge { display:inline-block; font-size:.75rem; color:var(--muted);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
footer { margin-top:4rem; border-top:1px solid var(--line); padding-top:1rem;
  color:var(--muted); font-size:.85rem; }`.trim();

  const toc = sections.map(s => `      <li><a href="#${s.id}">${escapeHtml(s.title)}</a> <span class="badge">${s.entries.length}</span></li>`).join('\n');

  const body = sections
    .map(section => {
      const heading = `    <h2 id="${section.id}">${escapeHtml(section.title)}</h2>\n    <p class="lede">${escapeHtml(section.blurb)}</p>`;
      if (!section.entries.length) return `${heading}\n    <p class="note">None.</p>`;

      if (section.format === 'table') {
        // Fonts carry no version — drop the column rather than printing a row of blanks.
        const hasVersion = section.entries.some(e => e.version);
        const rows = section.entries.map(e => `        <tr><td class="pkg">${escapeHtml(e.name)}</td>` + (hasVersion ? `<td>${escapeHtml(e.version ?? '')}</td>` : '') + `<td>${escapeHtml(e.license)}</td></tr>`).join('\n');
        return `${heading}
    <table>
      <thead><tr><th>${escapeHtml(section.nameLabel ?? 'Package')}</th>${hasVersion ? '<th>Version</th>' : ''}<th>License</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>`;
      }

      const blocks = section.entries
        .map(e => {
          const head = `    <h3>${escapeHtml(e.name)} <span class="badge">${escapeHtml(e.license)}</span></h3>`;
          return e.text ? `${head}\n    <pre>${escapeHtml(e.text)}</pre>` : head;
        })
        .join('\n');
      return `${heading}\n${blocks}`;
    })
    .join('\n');

  const generated = new Date().toISOString().slice(0, 10);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex" />
<title>Open Source Licenses — ${escapeHtml(target.label)}</title>
<style>
${style}
</style>
</head>
<body>
  <main>
    <h1>Open Source Licenses</h1>
    <p class="lede">This software is built on open source. Below is every third-party component it
      ships, with its license. Generated from the actual build output on ${generated} — not maintained by hand.</p>
    <nav>
      <ul>
${toc}
      </ul>
    </nav>
${body}
    <footer>
      <p>Component names and license texts are reproduced verbatim in English, as published by their
        respective authors. Each component remains the property of its copyright holders.</p>
    </footer>
  </main>
</body>
</html>
`;
}

// -------------------------------------------------------------------------------- driver

function buildSections(name, target) {
  const sections = [];
  if (target.bundle) {
    sections.push({
      id: 'app-libraries',
      title: 'Application libraries',
      blurb: 'Every npm package bundled into the application delivered to your browser, with its full license text.',
      format: 'text',
      entries: collectBundle(target.bundle),
    });
  }
  if (target.selfHostedFonts) {
    sections.push({
      id: 'fonts',
      title: 'Fonts',
      blurb: 'Typefaces served directly from this site. The Open Font License requires its text to accompany the font files.',
      format: 'text',
      entries: collectLicenseDir(target.selfHostedFonts),
    });
  }
  if (target.vendored) {
    sections.push({
      id: 'vendored',
      title: 'Vendored libraries',
      blurb: 'Libraries copied into this site instead of loaded from a public CDN, so that no request leaves your browser to a third party. Their licenses require the text to travel with the copy.',
      format: 'text',
      entries: collectLicenseDir(target.vendored),
    });
  }
  if (target.serverDeps) {
    sections.push({
      id: 'server',
      title: 'Server components',
      blurb: 'Libraries used by the Cloud Functions backend. This code is not distributed, so no license requires a notice — it is listed for transparency.',
      format: 'table',
      entries: collectServerDeps(),
    });
  }
  if (!sections.length) throw new Error(`target "${name}" declares no collectors`);
  return sections;
}

function reportPolicy(sections) {
  const histogram = new Map();
  const flagged = [];
  for (const section of sections) {
    for (const entry of section.entries) {
      histogram.set(entry.license, (histogram.get(entry.license) ?? 0) + 1);
      if (!ALLOWED.has(entry.license)) flagged.push({ ...entry, section: section.title });
    }
  }
  const ids = [...histogram.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  console.log(`     licenses: ${ids.map(([id, n]) => `${id}×${n}`).join(', ')}`);
  if (flagged.length) {
    console.log(`     ⚠ ${flagged.length} to review (reported only, never fails the build):`);
    for (const e of flagged) console.log(`       · ${e.name} — ${e.license}  [${e.section.toLowerCase()}]`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const requested = argv.filter(a => !a.startsWith('--'));
  const unknown = requested.filter(n => !TARGETS[n]);
  if (unknown.length) {
    console.error(`Unknown target(s): ${unknown.join(', ')}`);
    console.error(`Available: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }
  const names = requested.length ? requested : Object.keys(TARGETS);

  let failed = 0;
  for (const name of names) {
    const target = TARGETS[name];
    console.log(`\n  ${name}`);
    let sections;
    try {
      sections = buildSections(name, target);
    } catch (e) {
      console.error(`     ✖ ${e.message}`);
      failed++;
      continue;
    }
    const total = sections.reduce((n, s) => n + s.entries.length, 0);
    console.log(`     ${sections.map(s => `${s.title.toLowerCase()}: ${s.entries.length}`).join(', ')} (${total})`);
    reportPolicy(sections);

    if (check) continue;
    const out = join(ROOT, target.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, renderPage(target, sections));
    console.log(`     → ${target.out}`);
  }

  if (failed) {
    console.error(`\n✖ ${failed} target(s) failed.`);
    process.exit(1);
  }
  console.log(check ? '\n✔ check complete (nothing written).' : '\n✔ attribution generated.');
}

main();
