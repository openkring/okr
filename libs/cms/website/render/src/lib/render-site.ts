/**
 * The website renderer (design §7.4, §8, §10.1): website tree + pages + sections → static HTML per
 * language, plus sitemap.xml, robots.txt and the legacy redirect stubs. Runs in the publishWebsite
 * Cloud Function and in the developer preview/deploy scripts; Node-only, no Angular.
 *
 * Template set (per tenant website, `website.json` = TemplateManifest):
 *   layout.hbs              the page shell; gets a TemplateContext (render-context.ts)
 *   partials/<name>.hbs     `{{> nav}}`, `{{> footer}}`, … available in every template
 *   sections/<type>.hbs     one per manifest.sectionTypes entry; gets mapSection()'s output
 *   pages/<name>.hbs        one per manifest.fixedPages entry ({ name, slug }, rendered to <slug>.html); gets a TemplateContext (sections: [])
 *
 * Layout context (TemplateContext):
 *   {
 *     lang, languages,                       // 'en'; ['de', 'en'] — German first, at the root
 *     site: { name, domain, tagline },       // tagline in `lang`
 *     nav: NavItem[],                        // { id, type, label, url, style, current, children }
 *     footer: { tagline, items: NavItem[] }, // label/url per lang, archived nodes left out
 *     page: { key, slug, url, title, subTitle, abstract, banner: { url, alt }, metaDescription },
 *     sections: [{ type, key, html }],       // html = sections/<type>.hbs output, in page order
 *     main,                                  // the page body: sections joined, or the fixed page
 *     alternates: [{ lang, url }],           // absolute url of this page per language
 *   }
 * Every template also gets `@lang` and `@year`. Helpers: `eq`, `url`, `t`, `year` (render-helpers.ts).
 * Escaping is on: `{{x}}` is always safe; use `{{{x}}}` only for `main`, `sections.[].html` and a
 * section's sanitized rich text (`content`, accordion `items.[].content`).
 *
 * Output paths: German at the root (`index.html`, `vorstand.html`), other languages below their
 * code (`en/index.html`, `en/vorstand.html`); every active page node renders as `<slug>.html`, the
 * home page as `index.html`; fixed pages as `<name>.html` per language.
 *
 * All-or-nothing: validation problems, or any template/render error, return no files.
 */
import type { PageModel, WebsiteModel, WebsiteNode } from '@okr/shared-models';

import { publishedPageSections, resolveServableSection, validateForPublish, type PublishProblem, type TemplateManifest } from './publish-validation';
import {
  alternates,
  navItems,
  nodePath,
  pageContext,
  renderLanguages,
  siteOrigin,
  type SectionContext,
  type TemplateContext,
} from './render-context';
import { compileTemplate, createTemplateEnv, escapeXml, langPath, type RenderData, type RenderFn } from './render-helpers';
import { mapSection, pickText, type SanitizeFn, type SectionDoc } from './section-mapper';

export interface TemplateSet {
  manifest: TemplateManifest;
  layout: string;
  /** partial name (e.g. 'nav') → source */
  partials: Record<string, string>;
  /** section type → source */
  sections: Record<string, string>;
  /** fixed page name (e.g. 'news-artikel') → source */
  pages: Record<string, string>;
}

export interface RenderInput {
  site: WebsiteModel;
  pages: Map<string, PageModel>;
  sections: Map<string, SectionDoc>;
  templates: TemplateSet;
  /** storage path → public image url (the page banner) */
  imageUrl: (path: string) => string;
  /** the rich-text sanitizer, built by the caller with createSanitizer(sanitizeHtml) */
  sanitize: SanitizeFn;
}

export interface RenderedFile {
  /** relative to the hosting root, e.g. 'index.html', 'en/vorstand.html', 'sitemap.xml' */
  path: string;
  content: string;
}

export interface RenderResult {
  files: RenderedFile[];
  problems: PublishProblem[];
}

const SLUG = /^[a-z0-9-]+$/;
const LEGACY_KEY = /^[\w-]+$/;
const LEGACY_PATH = /^[\w-]+(\/[\w-]+)*\.html$/;

/** A page to render: the home page (file 'index') or an active page node (file = slug). */
interface PageEntry {
  key: string;
  file: string;
  /** site path in German */
  path: string;
  node?: WebsiteNode;
}

interface Compiled {
  layout: RenderFn;
  sections: Map<string, RenderFn>;
  pages: Map<string, RenderFn>;
}

function activePageNodes(nodes: WebsiteNode[], out: WebsiteNode[] = []): WebsiteNode[] {
  for (const n of nodes) {
    if (n.isArchived) continue;
    if (n.type === 'page' && n.pageKey) out.push(n);
    activePageNodes(n.children ?? [], out);
  }
  return out;
}

function pageEntries(site: WebsiteModel): PageEntry[] {
  const nodes = activePageNodes([...(site.nav ?? []), ...(site.footer ?? [])]);
  const home: PageEntry = { key: site.homePageKey, file: 'index', path: '/', node: nodes.find((n) => n.pageKey === site.homePageKey) };
  return [home, ...nodes.map((n) => ({ key: n.pageKey as string, file: n.slug ?? '', path: nodePath(n, site.homePageKey), node: n }))];
}

/**
 * The sections an accordion may show, as publicApi builds them: each item key resolved against the
 * site's tenants, servable sections only. Stored under the listed key (what mapSection looks up) and
 * the resolved key.
 */
function nestedSectionsOf(section: SectionDoc, tenants: string[], sections: Map<string, SectionDoc>): Map<string, SectionDoc> {
  const nested = new Map<string, SectionDoc>();
  if (section.type !== 'accordion') return nested;
  const items = (section.properties?.['items'] as { key?: unknown }[] | undefined) ?? [];
  for (const it of Array.isArray(items) ? items : []) {
    if (typeof it?.key !== 'string' || !it.key) continue;
    const found = resolveServableSection(it.key, tenants, sections);
    if (!found) continue;
    nested.set(it.key, found.section);
    nested.set(found.sectionKey, found.section);
  }
  return nested;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function compileAll(templates: TemplateSet): Compiled {
  const hbs = createTemplateEnv();
  for (const [name, source] of Object.entries(templates.partials)) {
    compileTemplate(hbs, `partials/${name}.hbs`, source); // syntax check, named
    hbs.registerPartial(name, source);
  }
  const compileEach = (dir: string, set: Record<string, string>): Map<string, RenderFn> =>
    new Map(Object.entries(set).map(([name, source]) => [name, compileTemplate(hbs, `${dir}/${name}.hbs`, source)]));
  return {
    layout: compileTemplate(hbs, 'layout.hbs', templates.layout),
    sections: compileEach('sections', templates.sections),
    pages: compileEach('pages', templates.pages),
  };
}

const filePath = (lang: string, file: string): string => (lang === 'de' ? `${file}.html` : `${lang}/${file}.html`);

/** One stub per legacy path: reads `?key=` and `location.replace`s to that page's slug (design §10.1). */
function legacyStubs(site: WebsiteModel, manifest: TemplateManifest, problems: PublishProblem[]): RenderedFile[] {
  const byPath = new Map<string, string[]>();
  for (const { from, key } of manifest.legacyRedirects ?? []) {
    if (!LEGACY_PATH.test(from ?? '') || !LEGACY_KEY.test(key ?? '')) {
      problems.push({ code: 'renderFailed', detail: `legacyRedirects: ${JSON.stringify({ from, key })}` });
      continue;
    }
    const node = activePageNodes([...(site.nav ?? []), ...(site.footer ?? [])]).find((n) => n.pageKey === key);
    const target = key === site.homePageKey || !node ? '/' : nodePath(node, site.homePageKey);
    const line = `if (k === ${JSON.stringify(key)}) location.replace('${target}');`;
    byPath.set(from, [...(byPath.get(from) ?? []), line]);
  }
  return [...byPath.entries()].map(([path, lines]) => ({
    path,
    content: [
      '<!doctype html>',
      '<html lang="de"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Weiterleitung</title>',
      '<noscript><meta http-equiv="refresh" content="0; url=/"></noscript>',
      '<script>',
      "var k = new URLSearchParams(location.search).get('key');",
      ...lines.map((l, i) => (i === 0 ? l : `else ${l}`)),
      "else location.replace('/');",
      '</script></head><body><a href="/">Weiter zur Startseite</a></body></html>',
      '',
    ].join('\n'),
  }));
}

/** One `<url>` per page and language, each with its hreflang alternates. */
function sitemap(entries: PageEntry[], site: WebsiteModel, languages: string[]): string {
  const origin = siteOrigin(site);
  const paths = [...new Set(entries.map((e) => e.path))];
  const urls = paths.flatMap((path) =>
    languages.map((lang) => {
      const links = alternates(path, languages, origin)
        .map((a) => `    <xhtml:link rel="alternate" hreflang="${escapeXml(a.lang)}" href="${escapeXml(a.url)}"/>`)
        .join('\n');
      return `  <url>\n    <loc>${escapeXml(origin + langPath(path, lang))}</loc>\n${links}\n  </url>`;
    }),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n');
}

function robots(site: WebsiteModel): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin(site)}/sitemap.xml\n`;
}

export function renderSite(input: RenderInput): RenderResult {
  const { site, pages, sections, templates, imageUrl, sanitize } = input;
  const validation = validateForPublish(site, pages, sections, templates.manifest);
  if (validation.length > 0) return { files: [], problems: validation };

  let compiled: Compiled;
  try {
    compiled = compileAll(templates);
  } catch (e) {
    return { files: [], problems: [{ code: 'renderFailed', detail: message(e) }] };
  }

  const problems: PublishProblem[] = [];
  const entries = pageEntries(site).filter((e) => {
    if (e.file === 'index' || SLUG.test(e.file)) return true;
    problems.push({ code: 'renderFailed', nodeId: e.node?.id, pageKey: e.key, detail: `slug ${JSON.stringify(e.file)}` });
    return false;
  });
  const fixedPages = templates.manifest.fixedPages.filter(({ name, slug }) => {
    if (SLUG.test(slug) && compiled.pages.has(name)) return true;
    problems.push({ code: 'templateMissing', detail: `pages/${name}.hbs` });
    return false;
  });
  const languages = renderLanguages(site);
  const tenants = site.tenants ?? [];
  const year = new Date().getFullYear();
  const files: RenderedFile[] = [];

  const layoutContext = (lang: string, key: string, path: string): Omit<TemplateContext, 'page' | 'sections' | 'main'> => ({
    lang,
    languages,
    site: { name: site.name ?? '', domain: siteOrigin(site), tagline: pickText(site.tagline, site.taglineI18n, lang) },
    nav: navItems(site.nav ?? [], site, lang, key),
    footer: { tagline: pickText(site.tagline, site.taglineI18n, lang), items: navItems(site.footer ?? [], site, lang, key) },
    alternates: alternates(path, languages, siteOrigin(site)),
  });

  const renderLayout = (file: string, lang: string, context: TemplateContext, data: RenderData, pageKey: string): void => {
    try {
      files.push({ path: filePath(lang, file), content: compiled.layout(context, data) });
    } catch (e) {
      problems.push({ code: 'renderFailed', pageKey, detail: message(e) });
    }
  };

  for (const lang of languages) {
    const data: RenderData = { lang, year };
    for (const entry of entries) {
      const page = pages.get(entry.key);
      const rendered: SectionContext[] = [];
      for (const { raw, sectionKey, section } of publishedPageSections(page, tenants, sections)) {
        const type = section.type ?? 'article';
        const template = compiled.sections.get(type);
        if (!template) {
          problems.push({ code: 'templateMissing', pageKey: entry.key, sectionKey: raw, detail: type });
          continue;
        }
        try {
          rendered.push({ type, key: sectionKey, html: template(mapSection(sectionKey, section, nestedSectionsOf(section, tenants, sections), sanitize, lang), data) });
        } catch (e) {
          problems.push({ code: 'renderFailed', pageKey: entry.key, sectionKey: raw, detail: message(e) });
        }
      }
      const label = entry.node ? pickText(entry.node.label, entry.node.labelI18n, lang) : '';
      const slug = entry.file === 'index' ? '' : entry.file;
      const context: TemplateContext = {
        ...layoutContext(lang, entry.key, entry.path),
        page: pageContext(entry.key, slug, entry.path, page, label, lang, imageUrl),
        sections: rendered,
        main: rendered.map((s) => s.html).join('\n'),
      };
      renderLayout(entry.file, lang, context, data, entry.key);
    }
    for (const { name, slug } of fixedPages) {
      const path = `/${slug}`;
      const base: TemplateContext = {
        ...layoutContext(lang, '', path),
        page: pageContext(name, slug, path, undefined, '', lang, imageUrl),
        sections: [],
        main: '',
      };
      try {
        const main = (compiled.pages.get(name) as RenderFn)(base, data);
        renderLayout(slug, lang, { ...base, main }, data, name);
      } catch (e) {
        problems.push({ code: 'renderFailed', pageKey: name, detail: message(e) });
      }
    }
  }

  files.push(...legacyStubs(site, templates.manifest, problems));
  files.push({ path: 'sitemap.xml', content: sitemap(entries, site, languages) });
  files.push({ path: 'robots.txt', content: robots(site) });

  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.path)) problems.push({ code: 'renderFailed', detail: `two files at ${f.path}` });
    seen.add(f.path);
  }
  if (problems.length > 0) {
    const unique = [...new Map(problems.map((p) => [JSON.stringify(p), p])).values()];
    return { files: [], problems: unique };
  }
  return { files, problems: [] };
}
