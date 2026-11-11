import type { PageModel, WebsiteModel, WebsiteNode } from '@okr/shared-models';

import { isAllowedLinkUrl } from './website-link.util';

export type WebsiteWarningCode =
  | 'pageMissing'
  | 'pageArchived'
  | 'pagePrivate'
  | 'slugDuplicate'
  | 'pageDuplicate'
  | 'linkInvalid'
  | 'homeMissing';

export interface WebsiteWarning {
  nodeId: string;
  code: WebsiteWarningCode;
}

function collect(nodes: WebsiteNode[], out: WebsiteNode[] = []): WebsiteNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children) collect(n.children, out);
  }
  return out;
}

export function pageKeysInTree(nodes: WebsiteNode[]): string[] {
  return collect(nodes)
    .filter((n) => n.type === 'page' && !!n.pageKey)
    .map((n) => n.pageKey as string);
}

export function websiteUrl(node: WebsiteNode): string {
  if (node.type === 'page') return `/${node.slug ?? ''}`;
  if (node.type === 'link') return node.url ?? '';
  return '';
}

/** Walks nav and footer, skipping archived nodes and their subtrees. */
function activeNodes(nodes: WebsiteNode[], out: WebsiteNode[] = []): WebsiteNode[] {
  for (const n of nodes) {
    if (n.isArchived) continue;
    out.push(n);
    if (n.children) activeNodes(n.children, out);
  }
  return out;
}

export function siteWarnings(site: WebsiteModel, pages: Map<string, PageModel>): WebsiteWarning[] {
  const warnings: WebsiteWarning[] = [];
  const slugs = new Set<string>();
  const keys = new Set<string>();
  for (const n of activeNodes([...(site.nav ?? []), ...(site.footer ?? [])])) {
    if (n.type === 'link') {
      if (!isAllowedLinkUrl(n.url ?? '')) warnings.push({ nodeId: n.id, code: 'linkInvalid' });
      continue;
    }
    if (n.type !== 'page') continue;
    const page = n.pageKey ? pages.get(n.pageKey) : undefined;
    if (!page) warnings.push({ nodeId: n.id, code: 'pageMissing' });
    else if (page.isArchived) warnings.push({ nodeId: n.id, code: 'pageArchived' });
    else if (page.isPrivate !== false) warnings.push({ nodeId: n.id, code: 'pagePrivate' });
    if (n.slug) {
      if (slugs.has(n.slug)) warnings.push({ nodeId: n.id, code: 'slugDuplicate' });
      slugs.add(n.slug);
    }
    if (n.pageKey) {
      if (keys.has(n.pageKey)) warnings.push({ nodeId: n.id, code: 'pageDuplicate' });
      keys.add(n.pageKey);
    }
  }
  if (!site.homePageKey) warnings.push({ nodeId: '', code: 'homeMissing' });
  return warnings;
}
