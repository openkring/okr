import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { AppStore } from '@okr/shared-feature';
import { MenuService } from '@okr/cms-menu-data-access';
import { PageService } from '@okr/cms-page-data-access';
import { SectionService } from '@okr/cms-section-data-access';
import { CategoryListModel, MenuItemModel, PageModel, SectionModel } from '@okr/shared-models';
import { downloadTextFile, exportCsv, getExportFileName } from '@okr/shared-util-angular';
import { getCategoryIcon } from '@okr/shared-util-core';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type DependencyNodeType = 'menu' | 'page' | 'section';

export interface DependencyNode {
  id: string;             // unique identifier within the tree
  nodeType: DependencyNodeType;
  name: string;           // display name
  subType: string;        // menu action | page.type | section.type
  color: string;          // Ionic color token
  icon: string;           // SVG icon name (for svgIcon pipe)
  state: string;
  roleNeeded: string;
  model: MenuItemModel | PageModel | SectionModel;
  children: DependencyNode[];
  isExpanded: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree-builder helpers (pure functions, no RxJS needed)
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the page ID from a navigate URL like /private/{id} or /public/{id}/{contextMenu}. */
export function extractPageId(url: string): string | undefined {
  if (!url) return undefined;
  const m = url.match(/\/(private|public)\/([^/?#]+)/);
  return m?.[2];
}

/** Extract optional context-menu name from a navigate URL. */
export function extractContextMenuName(url: string): string | undefined {
  if (!url) return undefined;
  const m = url.match(/\/(private|public)\/[^/?#]+\/([^/?#]+)/);
  return m?.[2];
}

/** Lookup a menu item by okey first, then by name (handles both storage variants). */
function findMenuItem(key: string, items: MenuItemModel[]): MenuItemModel | undefined {
  return items.find(i => i.okey === key) ?? items.find(i => i.name === key);
}

function menuColor(action: string): string {
  switch (action) {
    case 'navigate': return 'secondary';
    case 'browse':   return 'tertiary';
    case 'divider':  return 'primary';
    case 'sub':
    case 'main':
    case 'context':  return 'primary';
    default:         return 'primary';
  }
}

function menuIcon(action: string): string {
  switch (action) {
    case 'navigate': return 'navigate';
    case 'browse':   return 'globe';
    case 'divider':  return 'remove';
    case 'sub':      return 'chevron-forward';
    case 'context':  return 'ellipsis-vertical';
    default:         return 'menu';
  }
}

/** Which optional leaf node types are shown in the tree. */
export interface GraphFilter {
  context: boolean;
  section: boolean;
}

function buildSectionNodes(
  page: PageModel,
  allSections: SectionModel[],
  visitedPages: Set<string>,
  sectionTypes: CategoryListModel
): DependencyNode[] {
  const pageSections = allSections.filter(s => page.sections.includes(s.okey) && !s.isArchived)
  return page.sections
    .map(key => pageSections.find(s => s.okey === key))
    .filter((s): s is SectionModel => !!s)
    .map(s => ({
      id: `section-${s.okey}`,
      nodeType: 'section' as DependencyNodeType,
      name: s.name || s.title || s.okey,
      subType: s.type,
      color: 'warning',
      icon: getCategoryIcon(sectionTypes, s.type),
      state: s.state,
      roleNeeded: s.roleNeeded,
      model: s,
      children: [],
      isExpanded: false,
    }));
}

function buildPageNode(
  page: PageModel,
  contextMenuName: string | undefined,
  allMenuItems: MenuItemModel[],
  allSections: SectionModel[],
  visitedPages: Set<string>,
  sectionTypes: CategoryListModel,
  filter: GraphFilter
): DependencyNode {
  const children: DependencyNode[] = [];

  // Context menu (shown as a child node of the page)
  if (contextMenuName && filter.context) {
    const ctxItem = allMenuItems.find(i => i.name === contextMenuName);
    if (ctxItem) {
      children.push({
        id: `menu-ctx-${ctxItem.okey}`,
        nodeType: 'menu',
        name: ctxItem.name,
        subType: 'context',
        color: 'tertiary',
        icon: 'ellipsis-vertical',
        state: '',
        roleNeeded: ctxItem.roleNeeded ?? '',
        model: ctxItem,
        children: [],
        isExpanded: false,
      });
    }
  }

  // Sections
  if (filter.section) {
    children.push(...buildSectionNodes(page, allSections, visitedPages, sectionTypes));
  }

  return {
    id: `page-${page.okey}`,
    nodeType: 'page',
    name: page.name,
    subType: page.type,
    color: 'success',
    icon: 'document',
    state: page.state,
    roleNeeded: '',
    model: page,
    children,
    isExpanded: false,
  };
}

function buildMenuNode(
  item: MenuItemModel,
  allMenuItems: MenuItemModel[],
  allPages: PageModel[],
  allSections: SectionModel[],
  visitedMenus: Set<string>,
  visitedPages: Set<string>,
  sectionTypes: CategoryListModel,
  filter: GraphFilter
): DependencyNode {
  // Guard against circular references
  if (visitedMenus.has(item.okey)) {
    return {
      id: `menu-loop-${item.okey}`,
      nodeType: 'menu',
      name: `${item.name} [circular]`,
      subType: item.action,
      color: 'danger',
      icon: 'warning',
      state: '',
      roleNeeded: item.roleNeeded ?? '',
      model: item,
      children: [],
      isExpanded: false,
    };
  }
  visitedMenus.add(item.okey);

  const children: DependencyNode[] = [];

  // Recurse into sub-menu items (sub / main / context actions)
  if (['sub', 'main', 'context'].includes(item.action) && item.menuItems?.length) {
    for (const childKey of item.menuItems) {
      const child = findMenuItem(childKey, allMenuItems);
      if (child) {
        children.push(buildMenuNode(child, allMenuItems, allPages, allSections, new Set(visitedMenus), visitedPages, sectionTypes, filter));
      }
    }
  }

  // Navigate action → find and attach the target page
  if (item.action === 'navigate' && item.url) {
    const pageId = extractPageId(item.url);
    const ctxName = extractContextMenuName(item.url);
    if (pageId && !visitedPages.has(pageId)) {
      const page = allPages.find(p => p.okey === pageId);
      if (page) {
        visitedPages.add(pageId);
        children.push(buildPageNode(page, ctxName, allMenuItems, allSections, visitedPages, sectionTypes, filter));
      }
    }
  }

  return {
    id: `menu-${item.okey}`,
    nodeType: 'menu',
    name: item.name,
    subType: item.action,
    color: menuColor(item.action),
    icon: menuIcon(item.action),
    state: '',
    roleNeeded: item.roleNeeded ?? '',
    model: item,
    children,
    isExpanded: item.action === 'main', // auto-expand root
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Export helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Recursively collect all nodes into a 2-D array row (nodeType, name, state, roleNeeded, model). */
function flattenTree(node: DependencyNode, rows: string[][]): void {
  rows.push([node.nodeType, node.name, node.state, node.roleNeeded, JSON.stringify(node.model)]);
  for (const child of node.children) {
    flattenTree(child, rows);
  }
}

/** Recursively collect the ids of every node that has children (i.e. is expandable). */
function collectExpandableIds(node: DependencyNode, ids: string[]): void {
  if (node.children.length > 0) ids.push(node.id);
  for (const child of node.children) {
    collectExpandableIds(child, ids);
  }
}

/** Collect the ids of every expandable node down to `level` (root = level 1). */
export function collectIdsUpToLevel(node: DependencyNode, level: number, ids: string[], depth = 1): void {
  if (depth > level) return;
  if (node.children.length > 0) ids.push(node.id);
  for (const child of node.children) {
    collectIdsUpToLevel(child, level, ids, depth + 1);
  }
}

/** Walk the tree and collect all navigate menu items (they carry a page URL). */
function collectNavigateUrls(node: DependencyNode, urls: string[]): void {
  if (node.nodeType === 'menu' && node.subType === 'navigate') {
    const item = node.model as MenuItemModel;
    if (item.url) urls.push(item.url);
  }
  for (const child of node.children) {
    collectNavigateUrls(child, urls);
  }
}

/** Build a sitemap XML string per http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd */
function buildSitemap(tree: DependencyNode): string {
  const urls: string[] = [];
  collectNavigateUrls(tree, urls);
  const today = new Date().toISOString().slice(0, 10);
  const urlTags = urls.map(u =>
    `  <url>\n    <loc>${u}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.5</priority>\n  </url>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlTags}\n</urlset>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

/** How many tree levels are expanded (main menu = level 1); 'all' expands the whole tree. */
export type GraphLevel = 'all' | 1 | 2 | 3;

/** The order the level button cycles through on each click. */
export const GRAPH_LEVELS: GraphLevel[] = ['all', 1, 2, 3];

export type MenuGraphState = {
  expandedIds: string[];
  level: GraphLevel;
  showContext: boolean;
  showSection: boolean;
};

export const MenuGraphStore = signalStore(
  withState<MenuGraphState>({ expandedIds: [], level: 2, showContext: false, showSection: false }),
  withProps(() => ({
    appStore: inject(AppStore),
    menuService: inject(MenuService),
    pageService: inject(PageService),
    sectionService: inject(SectionService),
  })),

  withProps(store => ({
    allMenuItemsResource: rxResource({
      stream: () => store.menuService.list(),
    }),
    allPagesResource: rxResource({
      stream: () => store.pageService.list(),
    }),
    allSectionsResource: rxResource({
      stream: () => store.sectionService.list(),
    }),
  })),

  withComputed(state => ({
    allMenuItems: computed(() => state.allMenuItemsResource.value() ?? []),
    allPages:     computed(() => state.allPagesResource.value() ?? []),
    allSections:  computed(() => state.allSectionsResource.value() ?? []),
    isLoading: computed(() =>
      state.allMenuItemsResource.isLoading() ||
      state.allPagesResource.isLoading() ||
      state.allSectionsResource.isLoading()
    ),
    currentUser: computed(() => state.appStore.currentUser()),
    tenantId: computed(() => state.appStore.env.tenantId),
  })),

  withComputed(state => ({
    /** The fully built dependency tree rooted at the main menu. */
    dependencyTree: computed((): DependencyNode | null => {
      const items    = state.allMenuItems();
      const pages    = state.allPages();
      const sections = state.allSections();
      if (!items.length) return null;

      // The main menu item has name == 'main' or name == 'main_<tenantId>'
      const tenantId = state.tenantId();
      const mainItem = items.find(i => i.name === `main_${tenantId}`) ??
                       items.find(i => i.name === 'main' && i.action === 'main');
      if (!mainItem) return null;

      const sectionTypes = state.appStore.getCategory('section_type');
      const filter = { context: state.showContext(), section: state.showSection() };
      return buildMenuNode(mainItem, items, pages, sections, new Set(), new Set(), sectionTypes, filter);
    }),
  })),

  withComputed(state => ({
    /** Ids of every node that can be expanded (i.e. has children). */
    allExpandableIds: computed((): string[] => {
      const tree = state.dependencyTree();
      if (!tree) return [];
      const ids: string[] = [];
      collectExpandableIds(tree, ids);
      return ids;
    }),

    /** Ids of every expandable node down to the currently selected level. */
    levelIds: computed((): string[] => {
      const tree = state.dependencyTree();
      if (!tree) return [];
      const ids: string[] = [];
      collectIdsUpToLevel(tree, state.level() === 'all' ? Number.MAX_SAFE_INTEGER : state.level() as number, ids);
      return ids;
    }),
  })),

  withMethods(state => ({
    toggleExpanded(nodeId: string): void {
      const current = state.expandedIds();
      const next = current.includes(nodeId)
        ? current.filter(id => id !== nodeId)
        : [...current, nodeId];
      patchState(state, { expandedIds: next });
    },

    isExpanded(nodeId: string): boolean {
      return state.expandedIds().includes(nodeId);
    },

    /** Expand the tree down to `level` (main menu = level 1) and collapse everything below. */
    setLevel(level: GraphLevel): void {
      patchState(state, { level });
      patchState(state, { expandedIds: [...state.levelIds()] });
    },

    /** Step to the next level: all → 1 → 2 → 3 → all. */
    cycleLevel(): void {
      const next = GRAPH_LEVELS[(GRAPH_LEVELS.indexOf(state.level()) + 1) % GRAPH_LEVELS.length];
      patchState(state, { level: next });
      patchState(state, { expandedIds: [...state.levelIds()] });
    },

    /** Show or hide context-menu nodes, keeping the current expansion state. */
    setShowContext(show: boolean): void {
      patchState(state, { showContext: show });
      if (state.level() === 'all') patchState(state, { expandedIds: [...state.levelIds()] });
    },

    /** Show or hide section nodes, keeping the current expansion state. */
    setShowSection(show: boolean): void {
      patchState(state, { showSection: show });
      if (state.level() === 'all') patchState(state, { expandedIds: [...state.levelIds()] });
    },

    async export(type: string): Promise<void> {
      const tree = state.dependencyTree();
      if (!tree) return;

      switch(type) {
        case 'raw': {
          const rows: string[][] = [['nodeType', 'name', 'state', 'roleNeeded', 'model']];
          flattenTree(tree, rows);
          await exportCsv(rows, getExportFileName('dependencies', 'xlsx'), 'Dependencies');
          break;
        }
        case 'xml': {
          const xml = buildSitemap(tree);
          await downloadTextFile(xml, getExportFileName('sitemap', 'xml'));
          break;
        }
      }
    },
  }))
);
