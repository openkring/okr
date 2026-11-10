import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import type { PageModel, WebsiteModel, WebsiteNode } from '@okr/shared-models';

import type { TemplateManifest } from './publish-validation';
import { renderSite, type RenderInput, type RenderedFile, type TemplateSet } from './render-site';
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
    ['s-hero', { type: 'hero', state: 'published', title: 'Willkommen', properties: { titleI18n: { en: 'Welcome' } } }],
    ['s-board-scs', { type: 'article', state: 'published', title: 'Unser Vorstand', properties: { titleI18n: { en: 'Our board' } } }],
    ['s-plain', { type: 'article', state: 'published', title: 'Nur Deutsch', content: { htmlContent: '<p onclick="x">a</p><script>1</script>' } }],
    ['s-draft', { type: 'article', state: 'draft', title: 'Entwurf geheim' }],
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

  it('writes a stub per legacy path that maps ?key= to the slug', () => {
    const stub = fileOf(renderSite(input()).files, 'seite.html') ?? '';
    expect(stub).toContain("location.replace('/vorstand')");
    expect(stub).toContain('"scsw_vorstand"');
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
});
