import { describe, expect, it } from 'vitest';

import { CostCenterModel } from '@okr/shared-models';

import { costCenterLabel, costCenterPath, costCenterSubtreeKeys, leafCostCenters, sortCostCenterTree, wouldCreateCycle } from './cost-center.util';

const cc = (okey: string, id: string, name: string, parentKey = '', isArchived = false): CostCenterModel =>
  Object.assign(new CostCenterModel('scs', 'scs'), { okey, id, name, parentKey, isArchived });
const tree = [cc('a', '300', 'Sport'), cc('b', '310', 'Junioren', 'a'), cc('c', '320', 'Regatta', 'a'), cc('d', '330', 'Alt', 'a', true), cc('e', '100', 'Clubhaus')];

describe('cost-center tree', () => {
  it('leafCostCenters returns active nodes without children', () =>
    expect(leafCostCenters(tree).map(c => c.okey).sort()).toEqual(['b', 'c', 'e']));
  it('leafCostCenters skips a childless group or root — only type leaf is postable', () => {
    const typed = [...tree, Object.assign(cc('f', '200', 'Leer'), { type: 'group' as const }), Object.assign(cc('g', '900', 'Wurzel'), { type: 'root' as const })];
    expect(leafCostCenters(typed).map(c => c.okey).sort()).toEqual(['b', 'c', 'e']);
  });
  it('costCenterSubtreeKeys includes root and descendants', () =>
    expect([...costCenterSubtreeKeys(tree, 'a')].sort()).toEqual(['a', 'b', 'c', 'd']));
  it('costCenterSubtreeKeys of a leaf is the leaf', () =>
    expect([...costCenterSubtreeKeys(tree, 'b')]).toEqual(['b']));
  it('costCenterPath joins ancestors', () =>
    expect(costCenterPath(tree, 'b')).toBe('300 Sport › 310 Junioren'));
  it('costCenterPath of an unknown key is empty', () =>
    expect(costCenterPath(tree, 'zzz')).toBe(''));
  it('costCenterLabel formats number and name, empty for undefined', () => {
    expect(costCenterLabel(tree[1])).toBe('310 Junioren');
    expect(costCenterLabel(undefined)).toBe('');
  });
  it('wouldCreateCycle detects a move under the own subtree', () => {
    expect(wouldCreateCycle(tree, 'a', 'b')).toBe(true);
    expect(wouldCreateCycle(tree, 'a', 'a')).toBe(true);
    expect(wouldCreateCycle(tree, 'b', 'e')).toBe(false);
    expect(wouldCreateCycle(tree, 'b', '')).toBe(false);
  });
  it('sortCostCenterTree is depth-first by id', () =>
    expect(sortCostCenterTree(tree).map(n => `${n.depth}:${n.center.id}`)).toEqual(['0:100', '0:300', '1:310', '1:320', '1:330']));
});
