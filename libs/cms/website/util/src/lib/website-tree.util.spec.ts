import type { WebsiteNode } from '@okr/shared-models';

import {
  archiveNode, findNode, findParentId, insertNode, moveNode, moveTargets, newNodeId,
  reorderSiblings, slugify, uniqueSlug, updateNode,
} from './website-tree.util';

const page = (id: string, slug: string, pageKey = `p-${id}`): WebsiteNode => ({ id, type: 'page', label: id, slug, pageKey });
const menu = (id: string, children: WebsiteNode[] = []): WebsiteNode => ({ id, type: 'menu', label: id, children });

const tree = (): WebsiteNode[] => [
  menu('m1', [page('a', 'a'), menu('m2', [page('b', 'b')])]),
  page('c', 'c'),
  menu('m3'),
];

describe('find / insert / update', () => {
  it('finds nodes and parents', () => {
    expect(findNode(tree(), 'b')?.id).toBe('b');
    expect(findNode(tree(), 'zz')).toBeUndefined();
    expect(findParentId(tree(), 'b')).toBe('m2');
    expect(findParentId(tree(), 'c')).toBeNull();
  });
  it('inserts at an index without mutating', () => {
    const t = tree();
    const r = insertNode(t, 'm1', page('n', 'n'), 0);
    expect(findNode(r, 'm1')?.children?.[0].id).toBe('n');
    expect(findNode(t, 'm1')?.children?.length).toBe(2);
    expect(insertNode(t, null, page('n', 'n')).at(-1)?.id).toBe('n');
  });
  it('updates a node', () => {
    expect(findNode(updateNode(tree(), 'b', { label: 'X' }), 'b')?.label).toBe('X');
  });
});

describe('moveNode', () => {
  it('throws when moving into itself or a descendant', () => {
    expect(() => moveNode(tree(), 'm1', 'm1', 0)).toThrow('website.move.intoSelf');
    expect(() => moveNode(tree(), 'm1', 'm2', 0)).toThrow('website.move.intoSelf');
  });
  it('throws when the target is a page', () => {
    expect(() => moveNode(tree(), 'a', 'c', 0)).toThrow('website.move.notMenu');
  });
  it('throws when the target menu is archived', () => {
    const t = tree();
    t[2] = { ...t[2], isArchived: true };
    expect(() => moveNode(t, 'c', 'm3', 0)).toThrow('website.move.notMenu');
  });
  it('moves to top level index 0 and removes from old parent', () => {
    const r = moveNode(tree(), 'b', null, 0);
    expect(r[0].id).toBe('b');
    expect(findNode(r, 'm2')?.children).toEqual([]);
  });
  it('moves into a menu', () => {
    const r = moveNode(tree(), 'c', 'm3', 0);
    expect(findNode(r, 'm3')?.children?.[0].id).toBe('c');
    expect(r.some((n) => n.id === 'c')).toBe(false);
  });
});

describe('reorderSiblings', () => {
  it('reorders top level and nested', () => {
    expect(reorderSiblings(tree(), null, 0, 2).map((n) => n.id)).toEqual(['c', 'm3', 'm1']);
    const r = reorderSiblings(tree(), 'm1', 0, 1);
    expect(findNode(r, 'm1')?.children?.map((n) => n.id)).toEqual(['m2', 'a']);
  });
});

describe('archiveNode', () => {
  it('archives a menu subtree only', () => {
    const r = archiveNode(tree(), 'm1');
    expect(findNode(r, 'm1')?.isArchived).toBe(true);
    expect(findNode(r, 'a')?.isArchived).toBe(true);
    expect(findNode(r, 'b')?.isArchived).toBe(true);
    expect(findNode(r, 'c')?.isArchived).toBeUndefined();
    expect(findNode(r, 'm3')?.isArchived).toBeUndefined();
  });
});

describe('moveTargets', () => {
  it('excludes self, descendants and archived menus; includes top level', () => {
    const t = archiveNode(insertNode(tree(), null, menu('m4')), 'm4');
    const r = moveTargets(t, 'm1');
    expect(r[0]).toEqual({ id: null, label: '', depth: 0 });
    expect(r.map((x) => x.id)).toEqual([null, 'm3']);
  });
  it('lists nested menus with depth', () => {
    const r = moveTargets(tree(), 'c');
    expect(r.map((x) => [x.id, x.depth])).toEqual([[null, 0], ['m1', 1], ['m2', 2], ['m3', 1]]);
  });
});

describe('slugs', () => {
  it('slugify', () => {
    expect(slugify('Kurs für Erwachsene')).toBe('kurs-fuer-erwachsene');
    expect(slugify('  Über uns! ')).toBe('ueber-uns');
    expect(slugify('Straße')).toBe('strasse');
  });
  it('uniqueSlug', () => {
    const t = [page('x', 'vorstand'), page('y', 'vorstand-2')];
    expect(uniqueSlug(t, 'vorstand')).toBe('vorstand-3');
    expect(uniqueSlug(t, 'neu')).toBe('neu');
    expect(uniqueSlug([page('x', 'vorstand')], 'vorstand')).toBe('vorstand-2');
  });
});

describe('newNodeId', () => {
  it('newNodeId is 12 chars and varies', () => {
    expect(newNodeId()).toMatch(/^[a-z0-9]{12}$/);
    expect(newNodeId()).not.toBe(newNodeId());
  });
});
