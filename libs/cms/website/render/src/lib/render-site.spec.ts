import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { PageModel, WebsiteModel, WebsiteNode } from '@okr/shared-models';

import type { TemplateManifest } from './publish-validation';
import { renderSite, sectionContexts, type RenderInput, type RenderedFile, type TemplateSet } from './render-site';
import { createSanitizer, type SanitizeHtmlLike } from './sanitize';
import type { SectionDoc } from './section-mapper';

// render never imports sanitize-html (the function injects it); the spec borrows the functions' copy.
const repoRoot = join(__dirname, '../../../../../..');
const sanitizeHtml = createRequire(join(repoRoot, 'apps/functions/package.json'))('sanitize-html') as SanitizeHtmlLike;
const sanitize = createSanitizer(sanitizeHtml);

const fixtureDir = join(__dirname, '../fixtures/templates');
const readDir = (dir: string): Record<string, string> =>
  Object.fromEntries(readdirSync(join(fixtureDir, dir)).map((f) => [f.replace(/\.hbs$/, ''), readFileSync(join(fixtureDir, dir, f), 'utf8')]));

function fixtureTemplates(): TemplateSet {
  return {
    manifest: JSON.parse(readFileSync(join(fixtureDir, 'website.json'), 'utf8')) as TemplateManifest,
    layout: readFileSync(join(fixtureDir, 'layout.hbs'), 'utf8'),
    partials: readDir('partials'),
    sections: readDir('sections'),
    pages: readDir('pages'),
  };
}

const node = (id: string, slug: string, pageKey: string, extra: Partial<WebsiteNode> = {}): WebsiteNode =>
  ({ id, type: 'page', label: id, slug, pageKey, ...extra });
const pg = (sections: string[], extra: Partial<PageModel> = {}): PageModel =>
  ({ sections, title: '', subTitle: '', abstract: '', bannerUrl: '', bannerAltText: '', isPrivate: false, isArchived: false, ...extra }) as unknown as PageModel;

function input(overrides: Partial<RenderInput> = {}, siteExtra: Partial<WebsiteModel> = {}): RenderInput {
  const site = {
    okey: 'fixture',
    tenants: ['scs'],
    name: 'Fixture Club',
    domain: 'https://example.org',
    languages: ['de', 'en'],
    tagline: 'Am See',
    taglineI18n: { en: 'By the lake' },
    nav: [
      node('n-vorstand', 'vorstand', 'scsw_vorstand', { label: 'Vorstand', labelI18n: { en: 'Board' } }),
      node('n-old', 'alt', 'scsw_alt', { isArchived: true }),
      { id: 'n-link', type: 'link', label: 'Termine', url: '/termine?cat=regatta' },
    ],
    footer: [],
    homePageKey: 'scsw_home',
    ...siteExtra,
  } as unknown as WebsiteModel;
  const pages = new Map<string, PageModel>([
    ['scsw_home', pg(['s-hero'], { title: 'Start' })],
    ['scsw_vorstand', pg(['s-board-@TID@', 's-plain', 's-draft'], { title: 'Vorstand' })],
    ['scsw_alt', pg([])],
  ]);
  const sections = new Map<string, SectionDoc>([
    ['s-hero', { type: 'hero', state: 'published', tenants: ['scs'], title: 'Willkommen', properties: { titleI18n: { en: 'Welcome' } } }],
    ['s-board-scs', { type: 'article', state: 'published', tenants: ['scs'], title: 'Unser Vorstand', properties: { titleI18n: { en: 'Our board' } } }],
    ['s-plain', { type: 'article', state: 'published', tenants: ['scs'], title: 'Nur Deutsch', content: { htmlContent: '<p onclick="x">a</p><script>1</script>' } }],
    ['s-draft', { type: 'article', state: 'draft', tenants: ['scs'], title: 'Entwurf geheim' }],
  ]);
  return { site, pages, sections, templates: fixtureTemplates(), imageUrl: (p) => `https://img.example/${p}`, sanitize, ...overrides };
}

const fileOf = (files: RenderedFile[], path: string): string | undefined => files.find((f) => f.path === path)?.content;

describe('renderSite', () => {
  it('renders the home page at index.html, per language', () => {
    const { files, problems } = renderSite(input());
    expect(problems).toEqual([]);
    expect(fileOf(files, 'index.html')).toContain('Willkommen');
    expect(fileOf(files, 'en/index.html')).toContain('Welcome');
  });

  it('renders a site without footer', () => {
    const base = input();
    const site = { ...base.site } as Partial<WebsiteModel>;
    delete site.footer;
    const { files, problems } = renderSite({ ...base, site: site as WebsiteModel });
    expect(problems).toEqual([]);
    expect(fileOf(files, 'index.html')).toContain('Willkommen');
  });

  it('renders every page node per language, with the translation or German', () => {
    const { files } = renderSite(input());
    const de = fileOf(files, 'vorstand.html') ?? '';
    const en = fileOf(files, 'en/vorstand.html') ?? '';
    expect(de).toContain('Unser Vorstand');
    expect(en).toContain('Our board');
    expect(en).toContain('Nur Deutsch');
    expect(en).toContain('<html lang="en">');
  });

  it('prefixes site paths with the language directory', () => {
    const { files } = renderSite(input());
    const en = fileOf(files, 'en/vorstand.html') ?? '';
    expect(en).toContain('href="/en/vorstand"');
    expect(en).toContain('href="/en/termine?cat&#x3D;regatta"');
    expect(en).toContain('>Board<');
    expect(fileOf(files, 'vorstand.html')).toContain('href="/vorstand"');
  });

  it('skips archived nodes and draft sections', () => {
    const { files } = renderSite(input());
    expect(files.some((f) => f.path.includes('alt.html'))).toBe(false);
    expect(files.some((f) => f.content.includes('Entwurf geheim'))).toBe(false);
  });

  it('sanitizes rich text', () => {
    const de = fileOf(renderSite(input()).files, 'vorstand.html') ?? '';
    expect(de).toContain('<p>a</p>');
    expect(de).not.toContain('onclick');
    expect(de).not.toContain('<script>1');
  });

  it('escapes plain text', () => {
    const i = input();
    (i.site.nav[0] as WebsiteNode).label = '<b>Vorstand</b>';
    const de = fileOf(renderSite(i).files, 'vorstand.html') ?? '';
    expect(de).toContain('&lt;b&gt;Vorstand&lt;/b&gt;');
  });

  it('does not reach prototypes from a template', () => {
    const i = input();
    i.templates.layout = '<p id="x">{{constructor.constructor}}|{{site.constructor.name}}|{{lookup this "__proto__"}}</p>';
    const { files, problems } = renderSite(i);
    expect(problems).toEqual([]);
    expect(fileOf(files, 'index.html')).toBe('<p id="x">||</p>');
  });

  it('has no log helper', () => {
    const i = input();
    i.templates.layout = '{{log this}}';
    const { files, problems } = renderSite(i);
    expect(files).toEqual([]);
    expect(problems[0].code).toBe('renderFailed');
  });

  it('renders the fixed pages once per language', () => {
    const { files } = renderSite(input());
    expect(fileOf(files, 'news-artikel.html')).toContain('class="news-article" data-lang="de"');
    expect(fileOf(files, 'en/news-artikel.html')).toContain('data-lang="en"');
  });

  it('renders a fixed page at its own slug', () => {
    const i = input();
    i.templates.manifest.fixedPages = [{ name: 'news-artikel', slug: 'impressum' }];
    const { files, problems } = renderSite(i);
    expect(problems).toEqual([]);
    expect(fileOf(files, 'impressum.html')).toContain('class="news-article" data-lang="de"');
    expect(fileOf(files, 'en/impressum.html')).toContain('data-lang="en"');
    expect(fileOf(files, 'news-artikel.html')).toBeUndefined();
  });

  it('gives a fixed page its manifest title and description', () => {
    const i = input();
    i.templates.manifest.fixedPages = [{ name: 'news-artikel', slug: 'news-artikel', title: 'Artikel', description: 'Ein Artikel.' }];
    const { files, problems } = renderSite(i);
    expect(problems).toEqual([]);
    const html = fileOf(files, 'news-artikel.html') ?? '';
    expect(html).toContain('<title>Artikel – Fixture Club</title>');
    expect(html).toContain('<meta name="description" content="Ein Artikel.">');
  });

  it('writes a standalone fixed page as the whole document, without the layout', () => {
    const i = input();
    i.templates.manifest.fixedPages = [{ name: 'news-artikel', slug: 'news-artikel', standalone: true }];
    i.templates.pages['news-artikel'] = '<!doctype html><title>Solo</title><link rel="canonical" href="{{site.domain}}{{page.url}}">';
    const { files, problems } = renderSite(i);
    expect(problems).toEqual([]);
    expect(fileOf(files, 'news-artikel.html')).toBe('<!doctype html><title>Solo</title><link rel="canonical" href="https://example.org/news-artikel">');
    expect(fileOf(files, 'en/news-artikel.html')).toContain('https://example.org/en/news-artikel');
  });

  it('lists every page and language in sitemap.xml', () => {
    const xml = fileOf(renderSite(input()).files, 'sitemap.xml') ?? '';
    expect(xml.match(/<url>/g)?.length).toBe(4);
    expect(xml).toContain('<loc>https://example.org/en/vorstand</loc>');
    expect(xml).toContain('hreflang="en" href="https://example.org/en/vorstand"');
    expect(xml).toContain('<loc>https://example.org/</loc>');
  });

  it('points robots.txt at the sitemap', () => {
    expect(fileOf(renderSite(input()).files, 'robots.txt')).toContain('Sitemap: https://example.org/sitemap.xml');
  });

  it('writes a static stub per legacy path (no inline script) and legacy-redirects.json with the key to slug map', () => {
    const files = renderSite(input()).files;
    const stub = fileOf(files, 'seite.html') ?? '';
    expect(stub).toContain('<script src="/assets/legacy-redirect.js"></script>');
    expect(stub.match(/<script/g)).toHaveLength(1);
    const map = JSON.parse(fileOf(files, 'legacy-redirects.json') ?? '{}');
    expect(map['seite.html']['scsw_vorstand']).toBe('/vorstand');
    // the stub also exists below each language dir (relative seite.html?key=… on /en/…)
    expect(fileOf(files, 'en/seite.html')).toBe(stub);
    expect(fileOf(files, 'legacy-redirects.json')).toBeDefined();
    expect(files.filter((f) => f.path.endsWith('legacy-redirects.json'))).toHaveLength(1);
  });

  it('returns the validation problems and renders nothing', () => {
    const i = input({}, { homePageKey: '' });
    const { files, problems } = renderSite(i);
    expect(files).toEqual([]);
    expect(problems.map((p) => p.code)).toContain('homeMissing');
  });

  it('turns a broken template into renderFailed', () => {
    const i = input();
    i.templates.sections['article'] = '{{#if title}}unclosed';
    const { files, problems } = renderSite(i);
    expect(files).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0].code).toBe('renderFailed');
    expect(problems[0].detail).toContain('sections/article.hbs');
  });

  it('names the page and section of a runtime error', () => {
    const i = input();
    i.templates.sections['article'] = '{{missingHelper title}}';
    const { files, problems } = renderSite(i);
    expect(files).toEqual([]);
    expect(problems).toContainEqual(expect.objectContaining({ code: 'renderFailed', pageKey: 'scsw_vorstand', sectionKey: 's-board-@TID@' }));
    expect(problems[0].detail).toContain('sections/article.hbs');
  });

  it('skips archived and foreign-tenant sections without templateMissing', () => {
    const i = input();
    (i.pages.get('scsw_vorstand') as PageModel).sections.push('s-arch', 's-foreign');
    i.sections.set('s-arch', { type: 'weird', state: 'published', tenants: ['scs'], isArchived: true, title: 'Archiviert geheim' });
    i.sections.set('s-foreign', { type: 'article', state: 'published', tenants: ['other'], title: 'Fremd geheim' });
    const { files, problems } = renderSite(i);
    expect(problems).toEqual([]);
    expect(files.some((f) => f.content.includes('Archiviert geheim') || f.content.includes('Fremd geheim'))).toBe(false);
  });

  it('renders only servable nested accordion sections', () => {
    const i = input();
    i.templates.manifest.sectionTypes.push('accordion');
    i.templates.sections['accordion'] = '{{#each items}}<div>{{label}}:{{{content}}}</div>{{/each}}';
    (i.pages.get('scsw_vorstand') as PageModel).sections.push('s-acc');
    i.sections.set('s-acc', { type: 'accordion', state: 'published', tenants: ['scs'], properties: { items: [
      { key: 'n-ok-@TID@', label: 'ok' }, { key: 'n-draft', label: 'draft' }, { key: 'n-arch', label: 'arch' }, { key: 'n-foreign', label: 'foreign' },
    ] } });
    i.sections.set('n-ok-scs', { state: 'published', tenants: ['scs'], content: { htmlContent: '<p>Sichtbar</p>' } });
    i.sections.set('n-draft', { state: 'draft', tenants: ['scs'], content: { htmlContent: '<p>Entwurf geheim</p>' } });
    i.sections.set('n-arch', { state: 'published', tenants: ['scs'], isArchived: true, content: { htmlContent: '<p>Archiv geheim</p>' } });
    i.sections.set('n-foreign', { state: 'published', tenants: ['other'], content: { htmlContent: '<p>Fremd geheim</p>' } });
    const de = fileOf(renderSite(i).files, 'vorstand.html') ?? '';
    expect(de).toContain('<div>ok:<p>Sichtbar</p></div>');
    expect(de).toContain('<div>draft:</div>');
    expect(de).not.toMatch(/Entwurf geheim|Archiv geheim|Fremd geheim/);
  });

  it('refuses a site without domain', () => {
    const { files, problems } = renderSite(input({}, { domain: '' }));
    expect(files).toEqual([]);
    expect(problems).toEqual([{ code: 'domainMissing' }]);
  });
});

describe('sectionContexts', () => {
  it('adds the position on the page, the image-group and the per-type index', () => {
    const ctx = sectionContexts([
      { type: 'article', images: [] },
      { type: 'article', images: [{ url: 'a' }] },
      { type: 'album', images: [{ url: 'b' }] },
      { type: 'learning', locked: true },
      { type: 'learning', locked: false },
      { type: 'article', images: [{ url: 'c' }] },
      'not a record',
    ]);
    expect(ctx.map((c) => [c['sectionIndex'], c['albumIndex'], c['typeIndex']])).toEqual([
      [0, 0, 0],
      [1, 0, 1],
      [2, 1, 0],
      [3, 2, 0],
      [4, 2, 0],
      [5, 2, 2],
      [6, 3, 0],
    ]);
    expect(ctx[1]['type']).toBe('article');
    expect(ctx[6]['type']).toBeUndefined();
  });

  it('hands the indices to the section templates', () => {
    const base = input();
    const templates = { ...base.templates, sections: { ...base.templates.sections, article: '<i>{{sectionIndex}}:{{typeIndex}}</i>' } };
    const { files } = renderSite({ ...base, templates });
    expect(fileOf(files, 'vorstand.html')).toContain('<i>0:0</i>');
    expect(fileOf(files, 'vorstand.html')).toContain('<i>1:1</i>');
  });
});


describe('renderSite with a home layout (manifest.homeLayout)', () => {
  const pub = (type: string, extra: Partial<SectionDoc> = {}): SectionDoc => ({ type, state: 'published', tenants: ['scs'], ...extra });

  function homeInput(): RenderInput {
    const i = input();
    i.templates.manifest = { ...i.templates.manifest, homeLayout: 'pages/home', sectionTypes: ['article', 'hero', 'tiles', 'album'] };
    i.templates.layout = '{{#if home}}HOME{{/if}}{{{main}}}';
    i.templates.pages['home'] =
      '<main id="home">{{#each rows}}[{{kind}}|{{name}}|{{#if tinted}}T{{/if}}|{{#if variant}}V{{/if}}|'
      + '{{#if (eq kind "pair")}}{{#each sections}}{{type}};{{/each}}{{else}}{{{html}}}{{/if}}]{{/each}}</main>';
    i.templates.sections['home/article'] = '<a{{#if tinted}} t{{/if}}>{{title}}:{{albumIndex}}</a>';
    i.templates.sections['tiles'] = '<tiles/>';
    i.templates.sections['album'] = '{{#if images.length}}<g>{{albumIndex}}</g>{{/if}}';
    i.pages.set('scsw_home', pg(['h', 'a', 'stat', 'b', 'alb', 'empty', 'c']));
    i.sections.set('h', pub('hero', { name: 'Top', title: 'Hallo' }));
    i.sections.set('a', pub('article', { name: 'ueber-uns', title: 'A' }));
    i.sections.set('stat', pub('tiles', { name: 'zahlen', properties: { variant: 'stat', items: [{ value: '1' }] } }));
    i.sections.set('b', pub('article', { name: 'bild', title: 'B', properties: { images: [{ url: 'x.jpg' }] }, content: { htmlContent: '', position: 4 } as SectionDoc['content'] }));
    i.sections.set('alb', pub('album', { name: 'Album 1', properties: { images: [{ url: 'y.jpg' }] } }));
    i.sections.set('empty', pub('album', { name: 'leer' }));
    i.sections.set('c', pub('article', { name: 'c', title: 'C' }));
    return i;
  }

  it('renders the home page with the layout page template, rows and home section variants', () => {
    const { files, problems } = renderSite(homeInput());
    expect(problems).toEqual([]);
    const home = fileOf(files, 'index.html') ?? '';
    expect(home.startsWith('HOME<main id="home">')).toBe(true);
    const rows = [...home.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].replace(/\s+/g, ' '));
    expect(rows).toEqual([
      expect.stringMatching(/^hero\|top\|\|\|<section class="hero" id="top">/),
      'pair|ueber-uns|||article;tiles;',
      'single|bild|T|V|<a t>B:0</a>',
      'single|album-1|||<g>0</g>',
      'single|c|T|V|<a t>C:1</a>',
    ]);
  });

  it('keeps the plain layout for every other page', () => {
    const { files } = renderSite(homeInput());
    const vorstand = fileOf(files, 'vorstand.html') ?? '';
    expect(vorstand.startsWith('HOME')).toBe(false);
    expect(vorstand).toContain('<section class="article"');
    expect(vorstand).not.toContain('<a');
  });

  it('counts image groups only for sections drawn by a generic template', () => {
    const i = homeInput();
    i.pages.set('scsw_home', pg(['b', 'alb', 'alb']));
    const home = fileOf(renderSite(i).files, 'index.html') ?? '';
    expect(home).toContain('<g>0</g>');
    expect(home).toContain('<g>1</g>');
  });

  it('reports a missing layout page template', () => {
    const i = homeInput();
    delete i.templates.pages['home'];
    const { files, problems } = renderSite(i);
    expect(files).toEqual([]);
    expect(problems).toContainEqual(expect.objectContaining({ code: 'templateMissing', detail: 'pages/home.hbs' }));
  });

  it('reports an invalid homeLayout', () => {
    const i = homeInput();
    i.templates.manifest.homeLayout = 'layout';
    const { problems } = renderSite(i);
    expect(problems).toContainEqual(expect.objectContaining({ code: 'templateMissing', detail: 'homeLayout "layout"' }));
  });

  it('renders the home page as before without homeLayout, ignoring the home variants', () => {
    const i = homeInput();
    delete i.templates.manifest.homeLayout;
    const home = fileOf(renderSite(i).files, 'index.html') ?? '';
    expect(home.startsWith('HOME')).toBe(false);
    expect(home).not.toContain('<a');
    expect(home).toContain('<section class="article" id="ueber-uns">');
  });
});
