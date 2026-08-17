import { describe, expect, it } from 'vitest';
import { collectIdsUpToLevel, DependencyNode } from './menu-graph.store';

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
