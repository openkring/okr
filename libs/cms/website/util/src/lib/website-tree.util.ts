import type { PageModel, WebsiteModel, WebsiteNode } from '@okr/shared-models';

import { isAllowedLinkUrl } from './website-node.validations';

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

export interface MoveTarget {
  id: string | null;
  label: string;
  depth: number;
}

/** Applies `fn` to the sibling list of `parentId` (null = top level), returning a new tree. */
function withSiblings(nodes: WebsiteNode[], parentId: string | null, fn: (list: WebsiteNode[]) => WebsiteNode[]): WebsiteNode[] {
  if (parentId === null) return fn(nodes);
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: fn(n.children ?? []) };
    if (n.children?.length) return { ...n, children: withSiblings(n.children, parentId, fn) };
    return n;
  });
}

function removeNode(nodes: WebsiteNode[], id: string): WebsiteNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => (n.children?.length ? { ...n, children: removeNode(n.children, id) } : n));
}

export function findNode(nodes: WebsiteNode[], id: string): WebsiteNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = n.children ? findNode(n.children, id) : undefined;
    if (hit) return hit;
  }
  return undefined;
}

export function findParentId(nodes: WebsiteNode[], id: string): string | null {
  const walk = (list: WebsiteNode[], parent: string | null): string | null | undefined => {
    for (const n of list) {
      if (n.id === id) return parent;
      const hit = n.children ? walk(n.children, n.id) : undefined;
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  return walk(nodes, null) ?? null;
}

export function insertNode(nodes: WebsiteNode[], parentId: string | null, node: WebsiteNode, index?: number): WebsiteNode[] {
  return withSiblings(nodes, parentId, (list) => {
    const at = index === undefined ? list.length : Math.max(0, Math.min(index, list.length));
    return [...list.slice(0, at), node, ...list.slice(at)];
  });
}

export function updateNode(nodes: WebsiteNode[], id: string, patch: Partial<WebsiteNode>): WebsiteNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, ...patch };
    return n.children?.length ? { ...n, children: updateNode(n.children, id, patch) } : n;
  });
}

export function moveNode(nodes: WebsiteNode[], id: string, newParentId: string | null, index: number): WebsiteNode[] {
  const node = findNode(nodes, id);
  if (!node) return nodes;
  if (newParentId !== null) {
    if (newParentId === id || findNode(node.children ?? [], newParentId)) throw new Error('website.move.intoSelf');
    if (findNode(nodes, newParentId)?.type !== 'menu') throw new Error('website.move.notMenu');
  }
  return insertNode(removeNode(nodes, id), newParentId, node, index);
}

export function reorderSiblings(nodes: WebsiteNode[], parentId: string | null, from: number, to: number): WebsiteNode[] {
  return withSiblings(nodes, parentId, (list) => {
    if (from < 0 || from >= list.length) return list;
    const copy = [...list];
    const [moved] = copy.splice(from, 1);
    copy.splice(Math.max(0, Math.min(to, copy.length)), 0, moved);
    return copy;
  });
}

function archiveSubtree(n: WebsiteNode): WebsiteNode {
  return { ...n, isArchived: true, ...(n.children ? { children: n.children.map(archiveSubtree) } : {}) };
}

export function archiveNode(nodes: WebsiteNode[], id: string): WebsiteNode[] {
  return nodes.map((n) => {
    if (n.id === id) return archiveSubtree(n);
    return n.children?.length ? { ...n, children: archiveNode(n.children, id) } : n;
  });
}

export function moveTargets(nodes: WebsiteNode[], id: string): MoveTarget[] {
  const out: MoveTarget[] = [{ id: null, label: '', depth: 0 }];
  const walk = (list: WebsiteNode[], depth: number): void => {
    for (const n of list) {
      if (n.type !== 'menu' || n.isArchived || n.id === id) continue;
      out.push({ id: n.id, label: n.label, depth });
      walk(n.children ?? [], depth + 1);
    }
  };
  walk(nodes, 1);
  return out;
}

export function slugify(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function collect(nodes: WebsiteNode[], out: WebsiteNode[] = []): WebsiteNode[] {
  for (const n of nodes) {
    out.push(n);
    if (n.children) collect(n.children, out);
  }
  return out;
}

export function uniqueSlug(nodes: WebsiteNode[], base: string): string {
  const taken = new Set(collect(nodes).map((n) => n.slug).filter(Boolean));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
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

export function newNodeId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 12; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
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
  for (const n of activeNodes([...site.nav, ...site.footer])) {
    if (n.type === 'link') {
      if (!isAllowedLinkUrl(n.url ?? '')) warnings.push({ nodeId: n.id, code: 'linkInvalid' });
      continue;
    }
    if (n.type !== 'page') continue;
    const page = n.pageKey ? pages.get(n.pageKey) : undefined;
    if (!page) warnings.push({ nodeId: n.id, code: 'pageMissing' });
    else if (page.isArchived) warnings.push({ nodeId: n.id, code: 'pageArchived' });
    else if (page.isPrivate) warnings.push({ nodeId: n.id, code: 'pagePrivate' });
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
