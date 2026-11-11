/**
 * Shared by scripts/website-preview.mjs, website-import.mjs and website-deploy.mjs (spec 1.153 §9).
 * Everything here is read-only: it bundles @okr/cms-website-render (the technique of
 * apps/scs-website/tests/parity-harness.mjs), loads templates from disk, reads Firestore with
 * firebase-admin + ADC, and renders. No writes, no new dependencies.
 */
import { buildSync } from 'esbuild';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROJECT_ID = 'bkaiser-org';
const functionsRequire = createRequire(join(ROOT, 'apps/functions/package.json'));
const rootRequire = createRequire(join(ROOT, 'package.json'));

export const SAFE_TENANT = /^[a-z0-9-]+$/;

export function appDir(tenant) {
  return join(ROOT, 'apps', `${tenant}-website`);
}

export function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--') && !a.includes('=')));
  const values = Object.fromEntries(argv.filter((a) => a.startsWith('--') && a.includes('=')).map((a) => a.slice(2).split(/=(.*)/s)));
  return { flags, values, tenant: argv.find((a) => !a.startsWith('--')) };
}

export function requireTenant(tenant, usage) {
  if (!tenant || !SAFE_TENANT.test(tenant)) {
    console.error(usage);
    process.exit(1);
  }
  if (!existsSync(appDir(tenant))) {
    console.error(`No website app: apps/${tenant}-website`);
    process.exit(1);
  }
}

let renderLib;
/** `@okr/cms-website-render`, bundled in memory from its TypeScript source (handlebars external). */
export function loadRender() {
  if (renderLib) return renderLib;
  const out = buildSync({
    entryPoints: [join(ROOT, 'libs/cms/website/render/src/index.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['handlebars'],
    write: false,
    logLevel: 'silent',
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, rootRequire);
  renderLib = mod.exports;
  return renderLib;
}

/** The rich-text sanitizer, built from sanitize-html as installed for the Cloud Functions. */
export function getSanitizer() {
  const sanitizeHtml = functionsRequire('sanitize-html');
  return loadRender().createSanitizer(sanitizeHtml);
}

function hbsDir(dir) {
  if (!existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.hbs'))
      .map((f) => [f.slice(0, -4), readFileSync(join(dir, f), 'utf8')]),
  );
}

/** apps/<tenant>-website/templates/** as a TemplateSet (the local, not the uploaded, version). */
export function loadLocalTemplates(tenant) {
  const dir = join(appDir(tenant), 'templates');
  if (!existsSync(join(dir, 'layout.hbs'))) throw new Error(`apps/${tenant}-website/templates/layout.hbs is missing`);
  const manifestPath = [join(dir, 'website.json'), join(appDir(tenant), 'website.json')].find(existsSync);
  if (!manifestPath) throw new Error('website.json not found');
  const home = Object.entries(hbsDir(join(dir, 'sections/home'))).map(([type, src]) => [`home/${type}`, src]);
  return {
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
    layout: readFileSync(join(dir, 'layout.hbs'), 'utf8'),
    partials: hbsDir(join(dir, 'partials')),
    sections: { ...hbsDir(join(dir, 'sections')), ...Object.fromEntries(home) },
    pages: hbsDir(join(dir, 'pages')),
  };
}

/** Renders a site; the sanitizer is injected here. */
export function render({ site, pages, sections, templates }) {
  const lib = loadRender();
  return lib.renderSite({ site, pages, sections, templates, imageUrl: lib.toImgixUrl, sanitize: getSanitizer() });
}

/** The seed of a tenant as a render input, or of `seedFile`; undefined without apps/<tenant>-website/content/seed.json. */
export function loadSeedSource(tenant, seedFile) {
  const file = seedFile ? resolve(seedFile) : join(appDir(tenant), 'content', 'seed.json');
  if (!existsSync(file)) return undefined;
  const seed = JSON.parse(readFileSync(file, 'utf8'));
  const site = { tenants: [seed.site?.okey], isArchived: false, templateVersion: '', ...seed.site };
  const pages = new Map(Object.entries(seed.pages ?? {}).map(([k, p]) => [k, { isPrivate: false, ...p, okey: k, tenants: site.tenants }]));
  const sections = new Map(Object.entries(seed.sections ?? {}));
  return { site, pages, sections, origin: 'seed', file, seed };
}

// ─── Firestore (read-only) ────────────────────────────────────────────────────────────────────────

let db;
/** Firestore through ADC, project bkaiser-org. Callers only use .get() / .getAll(). */
export async function getDb() {
  if (db) return db;
  const { getApps, initializeApp } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  if (!getApps().length) initializeApp({ projectId: PROJECT_ID });
  db = getFirestore();
  return db;
}

async function getAllChunked(firestore, collection, ids) {
  const unique = [...new Set(ids.filter((id) => id && !id.includes('/')))];
  const out = [];
  for (let i = 0; i < unique.length; i += 100) {
    out.push(...(await firestore.getAll(...unique.slice(i, i + 100).map((id) => firestore.collection(collection).doc(id)))));
  }
  return out;
}

function collectPageKeys(nodes, out = []) {
  for (const n of nodes ?? []) {
    if (n.type === 'page' && n.pageKey) out.push(n.pageKey);
    collectPageKeys(n.children, out);
  }
  return out;
}

/**
 * Mirrors apps/functions/src/website/publish-website.ts loadSiteContent: the pages of the tree plus the
 * home page (owned by one of the site's tenants), their sections, then the accordion items.
 */
export async function loadLiveContent(firestore, site) {
  const { publishedPageSections } = loadRender();
  const tenants = site.tenants ?? [];
  const candidates = (raw) => [raw, ...tenants.map((t) => raw.replace('@TID@', t))];
  const pages = new Map();
  const pageKeys = [...collectPageKeys([...(site.nav ?? []), ...(site.footer ?? [])]), site.homePageKey];
  for (const snap of await getAllChunked(firestore, 'pages', pageKeys)) {
    const data = snap.data();
    if (!data) continue;
    const owners = Array.isArray(data.tenants) ? data.tenants : [];
    if (owners.some((t) => tenants.includes(t))) pages.set(snap.id, { ...data, okey: snap.id });
  }
  const sections = new Map();
  const loadSections = async (ids) => {
    for (const snap of await getAllChunked(firestore, 'sections', ids.filter((id) => !sections.has(id)))) {
      if (snap.data()) sections.set(snap.id, snap.data());
    }
  };
  await loadSections([...pages.values()].flatMap((p) => (p.sections ?? []).flatMap(candidates)));
  const nested = [];
  for (const page of pages.values()) {
    for (const { section } of publishedPageSections(page, tenants, sections)) {
      if (section.type !== 'accordion') continue;
      const items = section.properties?.items;
      for (const it of Array.isArray(items) ? items : []) if (typeof it?.key === 'string' && it.key) nested.push(...candidates(it.key));
    }
  }
  if (nested.length) await loadSections(nested);
  return { pages, sections };
}

/**
 * The live source of a tenant: websites/<siteId> (siteId from the template manifest) plus its content.
 * When the site doc does not exist yet, the synthetic site of apps/scs-website/tests/fixtures/site.json
 * stands in, and `synthetic` is true so the caller can say so.
 */
export async function loadLiveSource(tenant) {
  const manifest = loadLocalTemplates(tenant).manifest;
  const firestore = await getDb();
  const snap = await firestore.collection('websites').doc(manifest.siteId).get();
  let site;
  let synthetic = false;
  if (snap.exists) site = { ...snap.data(), okey: snap.id };
  else {
    const fixture = join(ROOT, 'apps/scs-website/tests/fixtures/site.json');
    site = { ...JSON.parse(readFileSync(fixture, 'utf8')), okey: manifest.siteId };
    synthetic = true;
  }
  const { pages, sections } = await loadLiveContent(firestore, site);
  return { site, pages, sections, origin: synthetic ? 'live content + SYNTHETIC site (websites/' + manifest.siteId + ' is missing; fixture used)' : 'live', synthetic };
}
