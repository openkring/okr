import { describe, expect, it } from 'vitest';
import type { MenuItemModel } from '@okr/shared-models';
import { isMenuNodeVisible } from './menu-visibility.util';

const doc = (name: string, action: string, menuItems: string[] = []): MenuItemModel =>
  ({ name, action, menuItems } as unknown as MenuItemModel);

function lookup(...docs: MenuItemModel[]) {
  const map = new Map(docs.map(d => [d.name, d]));
  return (name: string) => map.get(name);
}

describe('isMenuNodeVisible', () => {
  const hidden = (...keys: string[]) => (key: string) => !keys.includes(key);

  it('a leaf follows its row gate', () => {
    const byName = lookup(doc('a', 'navigate'));
    expect(isMenuNodeVisible('a', byName, hidden())).toBe(true);
    expect(isMenuNodeVisible('a', byName, hidden('a'))).toBe(false);
  });

  it('hides a sub whose children are all invisible', () => {
    const byName = lookup(doc('finance-menu', 'sub', ['expenses', 'my-cost-centers']), doc('expenses', 'navigate'), doc('my-cost-centers', 'navigate'));
    expect(isMenuNodeVisible('finance-menu', byName, hidden('expenses', 'my-cost-centers'))).toBe(false);
    expect(isMenuNodeVisible('finance-menu', byName, hidden('expenses'))).toBe(true);
  });

  it('hides a sub with no children at all', () => {
    expect(isMenuNodeVisible('s', lookup(doc('s', 'sub')), hidden())).toBe(false);
  });

  it('keeps a sub with an unresolved child (the «Missing:» placeholder renders)', () => {
    const byName = lookup(doc('s', 'sub', ['gone', 'x']), doc('x', 'navigate'));
    expect(isMenuNodeVisible('s', byName, hidden('x'))).toBe(true);
  });

  it('follows nested subs and terminates on a cycle', () => {
    const nested = lookup(doc('a', 'sub', ['b']), doc('b', 'sub', ['c']), doc('c', 'navigate'));
    expect(isMenuNodeVisible('a', nested, hidden('c'))).toBe(false);
    expect(isMenuNodeVisible('a', nested, hidden())).toBe(true);
    const cyclic = lookup(doc('a', 'sub', ['b']), doc('b', 'sub', ['a']));
    expect(isMenuNodeVisible('a', cyclic, hidden())).toBe(true);
  });

  it('a non-sub node with children (context) is not judged by them', () => {
    const byName = lookup(doc('c-x', 'context', ['x']), doc('x', 'call'));
    expect(isMenuNodeVisible('c-x', byName, hidden('x'))).toBe(true);
  });

  it('a node the sub row gate already hides stays hidden', () => {
    const byName = lookup(doc('s', 'sub', ['x']), doc('x', 'navigate'));
    expect(isMenuNodeVisible('s', byName, hidden('s'))).toBe(false);
  });
});
