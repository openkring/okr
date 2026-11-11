import type { PageModel, WebsiteModel, WebsiteNode } from '@okr/shared-models';

import { langPath } from './render-helpers';
import { normalizeLang, pickText } from './section-mapper';
import { isAllowedLinkUrl } from './website-link.util';

/** A nav or footer entry in one language. Archived nodes and their subtrees are left out. */
export interface NavItem {
  id: string;
  type: 'menu' | 'page' | 'link';
  /** the label in the render language, else German */
  label: string;
  /** in the render language's directory ('/en/vorstand'); '' for a menu or an unsafe link */
  url: string;
  /** 'button' = the call-to-action link (e.g. Mitgliederbereich) */
  style: 'default' | 'button';
  /** this entry (or, for a menu, one of its children) is the page being rendered */
  current: boolean;
  children: NavItem[];
}

export interface SiteContext {
  name: string;
  /** public origin without trailing slash, e.g. 'https://seeclub.org' */
  domain: string;
  /** the footer tagline in the render language */
  tagline: string;
}

export interface FooterContext {
  tagline: string;
  /** the footer columns: usually menus whose children are the links */
  items: NavItem[];
}

export interface PageContext {
  /** pages/{key}; for a fixed page its name, e.g. 'news-artikel' */
  key: string;
  /** '' for the home page */
  slug: string;
  /** site path in the render language, '/' or '/en/' for the home page */
  url: string;
  /** SEO title (page.title), else the nav label */
  title: string;
  subTitle: string;
  abstract: string;
  banner: { url: string; alt: string };
  /** the page's `description` meta tag, else its abstract */
  metaDescription: string;
}

export interface SectionContext {
  type: string;
  /** the resolved sections/{key} */
  key: string;
  /** output of sections/<type>.hbs */
  html: string;
}

export interface AlternateLink {
  lang: string;
  /** absolute url of the same page in that language */
  url: string;
}

/**
 * The context of `layout.hbs` (and of `pages/<name>.hbs` for a fixed page). Part 3 templates are
 * authored against this shape; see the header comment of render-site.ts.
 */
export interface TemplateContext {
  lang: string;
  languages: string[];
  site: SiteContext;
  nav: NavItem[];
  footer: FooterContext;
  page: PageContext;
  /** the page's published sections in order; empty for a fixed page */
  sections: SectionContext[];
  /** the page body: every section's html joined, or the fixed page's rendered template */
  main: string;
  alternates: AlternateLink[];
  /** true on the home page when `main` comes from the manifest's homeLayout page template */
  home?: boolean;
}

/** German first (the source, rendered at the root), then the site's other known languages. */
export function renderLanguages(site: WebsiteModel): string[] {
  const out = ['de'];
  for (const raw of site.languages ?? []) {
    const l = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
    if (normalizeLang(l) === l && !out.includes(l)) out.push(l);
  }
  return out;
}

export function siteOrigin(site: WebsiteModel): string {
  return (site.domain ?? '').trim().replace(/\/+$/, '');
}

/** The site path of a page node: '/' for the home page, else '/<slug>'. */
export function nodePath(node: WebsiteNode, homePageKey: string): string {
  return node.pageKey && node.pageKey === homePageKey ? '/' : `/${node.slug ?? ''}`;
}

export function navItems(nodes: WebsiteNode[], site: WebsiteModel, lang: string, currentKey: string): NavItem[] {
  const out: NavItem[] = [];
  for (const n of nodes) {
    if (n.isArchived) continue;
    const children = navItems(n.children ?? [], site, lang, currentKey);
    let url = '';
    if (n.type === 'page') url = langPath(nodePath(n, site.homePageKey), lang);
    else if (n.type === 'link' && isAllowedLinkUrl(n.url ?? '')) url = langPath((n.url ?? '').trim(), lang);
    out.push({
      id: n.id,
      type: n.type,
      label: pickText(n.label, n.labelI18n, lang),
      url,
      style: n.style === 'button' ? 'button' : 'default',
      current: (n.type === 'page' && !!currentKey && n.pageKey === currentKey) || children.some((c) => c.current),
      children,
    });
  }
  return out;
}

export function pageContext(
  key: string,
  slug: string,
  path: string,
  page: PageModel | undefined,
  fallbackTitle: string,
  lang: string,
  imageUrl: (path: string) => string,
): PageContext {
  const description = page?.meta?.find((m) => m.name === 'description')?.content ?? '';
  return {
    key,
    slug,
    url: langPath(path, lang),
    title: page?.title || fallbackTitle,
    subTitle: page?.subTitle ?? '',
    abstract: page?.abstract ?? '',
    banner: { url: page?.bannerUrl ? imageUrl(page.bannerUrl) : '', alt: page?.bannerAltText ?? '' },
    metaDescription: description || page?.abstract || '',
  };
}

export function alternates(path: string, languages: string[], origin: string): AlternateLink[] {
  return languages.map((l) => ({ lang: l, url: `${origin}${langPath(path, l)}` }));
}
