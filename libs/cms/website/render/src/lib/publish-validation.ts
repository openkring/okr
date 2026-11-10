import type { PageModel, WebsiteModel } from '@okr/shared-models';

import type { SectionDoc } from './section-mapper';
import { pageKeysInTree, siteWarnings, type WebsiteWarningCode } from './website-tree-read.util';

export type PublishProblemCode = WebsiteWarningCode | 'templateMissing' | 'noBaseRelease' | 'renderFailed';

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

/** Same one-liner as publicApi's isPublishedSection (functions cannot be imported here). */
function isPublished(section: SectionDoc): boolean {
  return section.state === 'published';
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
  if (!site.homePageKey || !pages.has(site.homePageKey)) {
    problems.push({ code: 'homeMissing', pageKey: site.homePageKey || undefined });
  }
  const keys = new Set([...pageKeysInTree([...site.nav, ...site.footer])]);
  if (site.homePageKey) keys.add(site.homePageKey);
  const tenants = site.tenants ?? [];
  for (const pageKey of keys) {
    for (const raw of pages.get(pageKey)?.sections ?? []) {
      const sectionKey = [raw, ...tenants.map((t) => raw.replace('@TID@', t))].find((k) => sections.has(k));
      const section = sectionKey ? sections.get(sectionKey) : undefined;
      if (!section || !isPublished(section)) continue;
      const type = section.type ?? 'article';
      if (!manifest.sectionTypes.includes(type)) {
        problems.push({ code: 'templateMissing', pageKey, sectionKey: raw, detail: type });
      }
    }
  }
  return problems;
}
