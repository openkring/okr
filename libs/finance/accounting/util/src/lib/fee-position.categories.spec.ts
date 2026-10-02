import { describe, expect, it } from 'vitest';

import { getFeeCategoryListCategory } from './fee-position.categories';

describe('getFeeCategoryListCategory', () => {
  const lists = [{ name: 'mcat_srv' }, { name: 'gender' }, { name: 'mcat_scs' }, { name: 'mcat' }];

  it('offers only the membership-category lists, sorted', () => {
    const names = getFeeCategoryListCategory('scs', lists).items.map(item => item.name);
    expect(names).toEqual(['mcat', 'mcat_scs', 'mcat_srv']);
  });

  it('keeps a stored value outside that set selectable', () => {
    const names = getFeeCategoryListCategory('scs', lists, 'legacy').items.map(item => item.name);
    expect(names).toContain('legacy');
  });

  it('does not duplicate a stored value that is already offered', () => {
    const names = getFeeCategoryListCategory('scs', lists, 'mcat_scs').items.map(item => item.name);
    expect(names.filter(name => name === 'mcat_scs')).toHaveLength(1);
  });

  it('does not translate the names', () => {
    expect(getFeeCategoryListCategory('scs', lists).translateItems).toBe(false);
  });
});
