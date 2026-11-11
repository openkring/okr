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
}

export interface TemplateManifest {
  siteId: string;
  version: string;
  sectionTypes: string[];
  fixedPages: string[];
  legacyRedirects?: { from: string; key: string }[];
}

/**
 * The same gate as publicApi's isServableSection (functions cannot be imported here): not archived,
 * owned by one of the site's tenants, published. A page can list keys that resolve to another
 * tenant's documents, so the tenant check is not redundant.
 */
export function isServableSection(section: SectionDoc | undefined, tenants: string[]): section is SectionDoc {
  return !!section && section.isArchived !== true
    && (section.tenants ?? []).some((t) => tenants.includes(t))
    && section.state === 'published';
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
  const keys = new Set([...pageKeysInTree([...(site.nav ?? []), ...(site.footer ?? [])])]);
  if (site.homePageKey) keys.add(site.homePageKey);
  const tenants = site.tenants ?? [];
  for (const pageKey of keys) {
    for (const { raw, section } of publishedPageSections(pages.get(pageKey), tenants, sections)) {
      const type = section.type ?? 'article';
      if (!manifest.sectionTypes.includes(type)) {
        problems.push({ code: 'templateMissing', pageKey, sectionKey: raw, detail: type });
      }
    }
  }
  return problems;
}
