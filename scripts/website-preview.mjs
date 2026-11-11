/**
 * Renders a tenant website locally and serves it (spec 1.153 §9).
 *
 *   node scripts/website-preview.mjs <tenant> [--live] [--seed=<file>] [--allow-problems] [--no-serve] [--check] [--port=4200]
 *
 * Source: apps/<tenant>-website/content/seed.json, or with --live Firestore (READ-ONLY, ADC, project
 * bkaiser-org: websites/<siteId> + its pages and sections; a synthetic fixture site stands in, flagged,
 * when the site doc does not exist). Templates always come from apps/<tenant>-website/templates.
 * Output: dist/website-preview/<tenant>/ = the website build's static assets (dist/apps/<tenant>-website,
 * else apps/<tenant>-website/assets) + the rendered pages. Clean URLs: /x serves x.html.
 *
 * --allow-problems (preview only) renders despite problems, flagged prominently.
 * --no-serve renders only. --check serves on a free port, fetches every rendered page, prints
 * status + size and exits (no long-running server).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';

import { appDir, loadLiveSource, loadLocalTemplates, loadSeedSource, parseArgs, render, requireTenant, ROOT } from './lib/website-tooling.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };

/** Maps a request path to a file inside root: exact, then x.html, then x/index.html. */
export function resolveFile(root, urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const base = resolve(root, '.' + normalize('/' + clean));
  if (base !== root && !base.startsWith(root + sep)) return undefined;
  for (const candidate of [base, base + '.html', join(base, 'index.html')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

export function serve(root, port) {
  const server = createServer((req, res) => {
    let file;
    try {
      file = resolveFile(root, req.url ?? '/');
    } catch {
      file = undefined;
    }
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok(server)));
}

/** Renders into dist/website-preview/<tenant>; returns { out, files, problems, source }. */
/**
 * Preview only: what the renderer needs to render at all despite problems. Pages become public and
 * unarchived, a missing home page becomes an empty stub. The caller still reports the original problems.
 */
export function relaxForPreview(source) {
  const pages = new Map();
  for (const [k, p] of source.pages) pages.set(k, { ...p, isPrivate: false, isArchived: false });
  if (source.site.homePageKey && !pages.has(source.site.homePageKey)) {
    pages.set(source.site.homePageKey, { okey: source.site.homePageKey, name: source.site.name, title: source.site.name, sections: [], isPrivate: false, tenants: source.site.tenants });
  }
  return { ...source, pages };
}

export async function renderPreview(tenant, { live, seed, allowProblems = false }) {
  const source = live ? await loadLiveSource(tenant) : loadSeedSource(tenant, seed);
  if (!source) throw new Error(`No apps/${tenant}-website/content/seed.json. Use --live to read Firestore.`);
  const templates = loadLocalTemplates(tenant);
  let result = render({ ...source, templates });
  const original = result.problems;
  if (allowProblems && original.length) result = render({ ...relaxForPreview(source), templates });
  const out = join(ROOT, 'dist/website-preview', tenant);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const built = join(ROOT, 'dist/apps', `${tenant}-website`);
  const assets = existsSync(built) ? built : appDir(tenant);
  cpSync(existsSync(built) ? built : join(appDir(tenant), 'assets'), existsSync(built) ? out : join(out, 'assets'), { recursive: true });
  for (const f of result.files) {
    mkdirSync(dirname(join(out, f.path)), { recursive: true });
    writeFileSync(join(out, f.path), f.content);
  }
  return { out, files: result.files, problems: allowProblems ? original : result.problems, remaining: result.problems, relaxed: allowProblems && original.length > 0, source, assetsFrom: assets };
}

async function main() {
  const { tenant, flags, values } = parseArgs(process.argv.slice(2));
  requireTenant(tenant, 'Usage: node scripts/website-preview.mjs <tenant> [--live] [--seed=<file>] [--allow-problems] [--no-serve] [--check] [--port=4200]');
  const live = flags.has('--live');
  const { out, files, problems, remaining, relaxed, source, assetsFrom } = await renderPreview(tenant, { live, seed: values.seed, allowProblems: flags.has('--allow-problems') });
  console.log(`Source: ${source.origin}${source.file ? ' (' + source.file.replace(ROOT + '/', '') + ')' : ''}`);
  console.log(`Static assets from: ${assetsFrom.replace(ROOT + '/', '')}`);
  console.log(`Rendered ${files.length} files into ${out.replace(ROOT + '/', '')}`);
  for (const f of files) console.log(`  ${f.path}  ${Buffer.byteLength(f.content)} B`);
  console.log(`Problems: ${problems.length}`);
  for (const p of problems) console.log(`  ${JSON.stringify(p)}`);
  if (relaxed) {
    console.log('\n!!! --allow-problems: PREVIEW ONLY. Pages were forced public and a missing home page was stubbed to render despite the problems above.');
    console.log('!!! This output is NOT publishable; website:import, website:deploy and publish still refuse.');
    if (remaining.length) for (const p of remaining) console.log(`  still failing: ${JSON.stringify(p)}`);
  }
  if (flags.has('--no-serve')) return;

  const server = await serve(out, flags.has('--check') ? 0 : Number(values.port ?? 4200));
  const port = server.address().port;
  if (!flags.has('--check')) {
    console.log(`\nServing http://127.0.0.1:${port}/  (Ctrl-C to stop)`);
    return;
  }
  console.log(`\nChecking pages on http://127.0.0.1:${port}/`);
  for (const f of files.filter((x) => x.path.endsWith('.html'))) {
    const url = `http://127.0.0.1:${port}/${f.path === 'index.html' ? '' : f.path.replace(/\.html$/, '')}`;
    const r = await fetch(url);
    console.log(`  ${r.status}  ${(await r.text()).length} chars  ${url}`);
  }
  server.close();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.stack ?? String(e));
    process.exit(1);
  });
}
