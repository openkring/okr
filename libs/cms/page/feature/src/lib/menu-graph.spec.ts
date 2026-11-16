import { describe, expect, it } from 'vitest';
import { MenuItemModel, PageModel, SectionModel, WebsiteModel } from '@okr/shared-models';
import { buildWebsiteTree, collectIdsUpToLevel, DependencyNode } from './menu-graph.store';
import { flattenMenuTree } from './menu-tree';

function node(id: string, children: DependencyNode[] = []): DependencyNode {
  return { id, nodeType: 'menu', name: id, subType: 'sub', color: '', icon: '', state: '', roleNeeded: '', model: {} as never, children, isExpanded: false };
}

/** main(1) → sub(2) → navigate(3) → page(4) */
const tree = node('main', [node('sub', [node('navigate', [node('page')])])]);

describe('collectIdsUpToLevel', () => {
  it('level 1 expands the main menu only', () => {
    const ids: string[] = [];
    collectIdsUpToLevel(tree, 1, ids);
    expect(ids).toEqual(['main']);
  });

  it('level 2 expands the main menu and its sub menus', () => {
    const ids: string[] = [];
    collectIdsUpToLevel(tree, 2, ids);
    expect(ids).toEqual(['main', 'sub']);
  });

  it('skips leaf nodes (nothing to expand)', () => {
    const ids: string[] = [];
    collectIdsUpToLevel(tree, 9, ids);
    expect(ids).toEqual(['main', 'sub', 'navigate']);
  });
});

describe('buildWebsiteTree', () => {
  const website = {
    okey: 'scs', name: 'Seeclub', domain: 'https://seeclub.org',
    nav: [
      { id: 'm1', type: 'menu', label: 'Verein', children: [
        { id: 'p1', type: 'page', label: 'Vorstand', pageKey: 'scsw_vorstand', slug: 'vorstand' },
        { id: 'l1', type: 'link', label: 'Termine', url: '/termine' },
      ] },
    ],
    footer: [{ id: 'f1', type: 'link', label: 'Impressum', url: '/impressum', isArchived: true }],
  } as unknown as WebsiteModel;
  const pages = [{ okey: 'scsw_vorstand', name: 'Vorstand', type: 'content', state: 'published', sections: ['s1'] }] as unknown as PageModel[];
  const sections = [{ okey: 's1', name: 'Board', type: 'people', state: 'published', isArchived: false }] as unknown as SectionModel[];
  const sectionTypes = { items: [] } as never;

  it('walks site → menu → page entry → page, sections only when switched on', () => {
    const tree = buildWebsiteTree(website, pages, sections, sectionTypes, { context: true, section: false });
    expect(tree.subType).toBe('website');
    const menu = tree.children[0];
    expect(menu.subType).toBe('menu');
    const [entry, link] = menu.children;
    expect(entry.state).toBe('/vorstand');
    expect(entry.children.map(c => c.nodeType)).toEqual(['page']);
    expect(entry.children[0].children).toEqual([]);   // no context menu on a website page
    expect(link.subType).toBe('link');
    const withSections = buildWebsiteTree(website, pages, sections, sectionTypes, { context: false, section: true });
    expect(withSections.children[0].children[0].children[0].children.map(c => c.nodeType)).toEqual(['section']);
  });

  it('puts the footer under its own node and marks archived entries', () => {
    const tree = buildWebsiteTree(website, pages, sections, sectionTypes, { context: false, section: false });
    const footer = tree.children[1];
    expect(footer.name).toBe('footer');
    expect(footer.children[0].state).toBe('archived');
  });
});

describe('flattenMenuTree', () => {
  const m = (name: string, action: string, menuItems: string[] = []) => ({ okey: name, name, action, menuItems }) as unknown as MenuItemModel;
  const items = [
    m('main_scs', 'main', ['a', 'cms', 'ctx']),
    m('a', 'navigate'),
    m('cms', 'sub', ['b', 'cms']),   // self-reference must not loop
    m('b', 'navigate'),
    m('ctx', 'context', ['b']),
  ];

  it('lists entries in render order with their depth, skipping context menus and cycles', () => {
    const rows = flattenMenuTree(items[0], items);
    expect(rows.map(r => `${r.item.name}:${r.depth}`)).toEqual(['a:0', 'cms:0', 'b:1']);
  });
});
