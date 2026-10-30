import { describe, expect, it } from 'vitest';
import { IconModel } from '@okr/shared-models';
import { getIconIndex, getIconIndexInfo } from './icon.util';

const icon = (overrides: Partial<IconModel> = {}): IconModel =>
  Object.assign(new IconModel('system'), { name: 'rocket', type: 'icons', ...overrides });

describe('getIconIndex', () => {
  it('builds the index from name and type', () => {
    expect(getIconIndex(icon())).toBe('n:rocket t:icons');
  });

  it('adds the additional search fields', () => {
    expect(getIconIndex(icon({ name: 'business', searchFields: 'suitcase work' })))
      .toBe('n:business t:icons s:suitcase work');
  });

  it('ignores the previous index, so repeated saves never duplicate it', () => {
    const first = icon({ index: 'rocket icons rocket icons' });
    first.index = getIconIndex(first);
    expect(getIconIndex(first)).toBe('n:rocket t:icons');
  });

  it('tolerates a legacy doc without searchFields', () => {
    const legacy = icon();
    delete (legacy as Partial<IconModel>).searchFields;
    expect(getIconIndex(legacy)).toBe('n:rocket t:icons');
  });
});

describe('getIconIndexInfo', () => {
  it('names every index field', () => {
    expect(getIconIndexInfo()).toBe('n:name t:type s:searchFields');
  });
});
