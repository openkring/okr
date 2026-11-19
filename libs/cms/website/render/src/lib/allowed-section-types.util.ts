import type { WebsiteModel, WebsiteNode } from '@okr/shared-models';

/** Whether a live (non-archived) page node below `nodes` points at `pageKey`; an archived menu hides its children. */
function showsPage(nodes: WebsiteNode[] | undefined, pageKey: string): boolean {
  return (nodes ?? []).some((n) => !n.isArchived
    && ((n.type === 'page' && n.pageKey === pageKey) || showsPage(n.children, pageKey)));
}

/**
 * The section types a page may get when it is published on a website (spec 1.165 §7.5): the
 * intersection of the `sectionTypes` of every live site whose tree (nav or footer) shows the page.
 * `undefined` = no limit — the page is on no website, or no such site has stored its types yet
 * (website:deploy writes them from the template manifest).
 */
export function allowedSectionTypesForPage(pageKey: string, sites: WebsiteModel[]): string[] | undefined {
  let allowed: string[] | undefined;
  for (const site of sites) {
    if (site.isArchived || !Array.isArray(site.sectionTypes)) continue;
    if (!showsPage(site.nav, pageKey) && !showsPage(site.footer, pageKey)) continue;
    allowed = allowed === undefined ? [...site.sectionTypes] : allowed.filter((t) => site.sectionTypes?.includes(t));
  }
  return allowed;
}
