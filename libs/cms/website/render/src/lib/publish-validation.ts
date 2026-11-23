import type { PageModel, WebsiteModel, WebsiteNode } from '@okr/shared-models';

import type { SectionDoc } from './section-mapper';
import { pageKeysInTree, siteWarnings, type WebsiteWarningCode } from './website-tree-read.util';

/**
 * `alreadyRunning`: another publish of the site holds the lock (younger than 5 min).
 * `hostingSiteInvalid`: `hostingSite` is not one of our website Hosting sites (`<x>-website-<id>`).
 */
export type PublishProblemCode =
  | WebsiteWarningCode | 'templateMissing' | 'noBaseRelease' | 'renderFailed' | 'domainMissing' | 'alreadyRunning' | 'hostingSiteInvalid';

export interface PublishProblem {
  code: PublishProblemCode;
  nodeId?: string;
  pageKey?: string;
  sectionKey?: string;
  detail?: string;
  /** templateMissing: the page's and the section's titles, so the app can say where in words (spec 1.165 §7.5) */
  pageTitle?: string;
  sectionTitle?: string;
}

export interface FixedPage {
  name: string;
  slug: string;
  title?: string;
  description?: string;
  standalone?: boolean;
  editable?: boolean;
}

/** The fixed page that the tree page with `slug` fills, if the manifest lets one do so. */
export function editableFixedPage(fixedPages: FixedPage[], slug: string | undefined): FixedPage | undefined {
  return slug ? fixedPages.find((f) => f.slug === slug && f.editable === true && !f.standalone) : undefined;
}

export interface TemplateManifest {
  siteId: string;
  version: string;
  sectionTypes: string[];
  /**
   * `pages/<name>.hbs` is rendered to `<slug>.html` per language. `title` and `description` become
   * the page's `<title>` / meta description (a fixed page has no page document to take them from);
   * `standalone` writes the template's output as the whole document, without layout.hbs (a
   * marketing page with its own head and no site header/footer).
   * `editable`: a page entry of the tree may use the same slug. Its CMS page then gives the fixed page
   * its heading, title and sections (editableFixedPage); without such an entry the template's own
   * heading stands. Ignored with `standalone`.
   */
  fixedPages: FixedPage[];
  legacyRedirects?: { from: string; key: string }[];
  /**
   * `pages/<name>` (e.g. 'pages/home'): the home page is drawn by that page template from rows of
   * sections (home-layout.ts), each section by `sections/home/<type>.hbs` when the set has one,
   * else by its generic template. Unset: the home page renders like every other page.
   */
  homeLayout?: string;
}

/**
 * Whether a `roleNeeded` lets everybody see a section: 'public' («everyone, logged in or not» in hasRole).
 * The legacy 'none' (merged into 'public' on 2026-11-22; an old app version may still write it) counts too.
 * A website and publicApi have no login, so anything else — a role for members or editors (registered,
 * privileged, contentAdmin …), 'anonymous', or no `roleNeeded` at all — is never served.
 * The one rule for website sections (isServableSection here and in publicApi's page route) and news articles.
 */
export function isPublicRole(roleNeeded: unknown): boolean {
  return roleNeeded === 'none' || roleNeeded === 'public';
}

/**
 * The same gate as publicApi's isServableSection (functions cannot be imported here): not archived,
 * owned by one of the site's tenants, published, and public (isPublicRole). A page can list keys that
 * resolve to another tenant's documents, so the tenant check is not redundant.
 */
export function isServableSection(section: SectionDoc | undefined, tenants: string[]): section is SectionDoc {
  return !!section && section.isArchived !== true
    && (section.tenants ?? []).some((t) => tenants.includes(t))
    && section.state === 'published'
    && isPublicRole(section.roleNeeded);
}

/** A section key as listed (may contain `@TID@`), resolved to the first servable sections/{key}. */
export function resolveServableSection(
  raw: string,
  tenants: string[],
  sections: Map<string, SectionDoc>,
): { sectionKey: string; section: SectionDoc } | undefined {
  for (const key of [raw, ...tenants.map((t) => raw.replace('@TID@', t))]) {
    const section = sections.get(key);
    if (isServableSection(section, tenants)) return { sectionKey: key, section };
  }
  return undefined;
}

/** Whether a non-archived node of the tree already points at `pageKey` (siteWarnings reports it). */
function activeInTree(nodes: WebsiteNode[], pageKey: string): boolean {
  return nodes.some((n) => !n.isArchived && ((n.type === 'page' && n.pageKey === pageKey) || activeInTree(n.children ?? [], pageKey)));
}

function treePageSlugs(nodes: WebsiteNode[]): string[] {
  return nodes.flatMap((n) => [
    ...(!n.isArchived && n.type === 'page' && n.slug ? [n.slug] : []),
    ...(n.isArchived ? [] : treePageSlugs(n.children ?? [])),
  ]);
}

export interface PageSection {
  /** the key as listed on the page, may contain `@TID@` */
  raw: string;
  /** the resolved sections/{key} */
  sectionKey: string;
  section: SectionDoc;
}

/**
 * The servable sections of a page in page order: each listed key as is, else with `@TID@` replaced
 * by one of the site's tenants. Missing, draft, archived and foreign-tenant sections are left out.
 * Validation and rendering both list a page's sections through here.
 */
export function publishedPageSections(page: PageModel | undefined, tenants: string[], sections: Map<string, SectionDoc>): PageSection[] {
  const out: PageSection[] = [];
  for (const raw of page?.sections ?? []) {
    const found = resolveServableSection(raw, tenants, sections);
    if (found) out.push({ raw, ...found });
  }
  return out;
}

/**
 * Everything that must be true before a site is rendered: the tree warnings, a present home page,
 * and a template block for every published section. Nested accordion sections are plain content
 * and not type-checked (publicApi renders them as html only).
 */
export function validateForPublish(
  site: WebsiteModel,
  pages: Map<string, PageModel>,
  sections: Map<string, SectionDoc>,
  manifest: TemplateManifest,
): PublishProblem[] {
  const problems: PublishProblem[] = siteWarnings(site, pages)
    .filter((w) => w.code !== 'homeMissing')
    .map((w) => ({ code: w.code, nodeId: w.nodeId }));
  // sitemap.xml and hreflang need absolute urls
  if (!(site.domain ?? '').trim()) problems.push({ code: 'domainMissing' });
  if (!site.homePageKey || !pages.has(site.homePageKey)) {
    problems.push({ code: 'homeMissing', pageKey: site.homePageKey || undefined });
  }
  const home = site.homePageKey ? pages.get(site.homePageKey) : undefined;
  if (home && !activeInTree([...(site.nav ?? []), ...(site.footer ?? [])], site.homePageKey)) {
    if (home.isArchived) problems.push({ code: 'pageArchived', pageKey: site.homePageKey });
    else if (home.isPrivate !== false) problems.push({ code: 'pagePrivate', pageKey: site.homePageKey });
  }
  const treeSlugs = new Set(treePageSlugs([...(site.nav ?? []), ...(site.footer ?? [])]));
  for (const { slug } of manifest.fixedPages) {
    const taken = treeSlugs.has(slug) && !editableFixedPage(manifest.fixedPages, slug);
    if (taken || slug === 'index') problems.push({ code: 'slugDuplicate', detail: slug });
  }
  const keys = new Set([...pageKeysInTree([...(site.nav ?? []), ...(site.footer ?? [])])]);
  if (site.homePageKey) keys.add(site.homePageKey);
  const tenants = site.tenants ?? [];
  for (const pageKey of keys) {
    for (const { raw, section } of publishedPageSections(pages.get(pageKey), tenants, sections)) {
      const type = section.type ?? 'article';
      if (!manifest.sectionTypes.includes(type)) {
        const pageTitle = (pages.get(pageKey)?.name ?? '').trim();
        const sectionTitle = (section.title ?? '').trim();
        problems.push({ code: 'templateMissing', pageKey, sectionKey: raw, detail: type, ...(pageTitle ? { pageTitle } : {}), ...(sectionTitle ? { sectionTitle } : {}) });
      }
    }
  }
  return problems;
}
