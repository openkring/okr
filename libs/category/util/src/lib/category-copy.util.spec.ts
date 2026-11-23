import { describe, expect, it } from 'vitest';

import { CategoryItemModel, CategoryListModel } from '@okr/shared-models';

import { categoryCopyStatus, withSharedItem } from './category-copy.util';
import { missingProtectedItems } from './category-protection.util';

function list(okey: string, name: string, tenants: string[], ...items: string[]): CategoryListModel {
  const cat = new CategoryListModel('');
  Object.assign(cat, { okey, name, tenants, items: items.map(item => new CategoryItemModel(item, 'icon_' + item)) });
  return cat;
}
const system = list('sys', 'gender', ['system'], 'male', 'female', 'other');

describe('categoryCopyStatus', () => {
  const locked = (loaded: CategoryListModel, all: CategoryListModel[]) => categoryCopyStatus(loaded, all, 'scs').kind !== 'own';

  it('is free for a list the tenant owns alone and no system list shares its name', () => {
    const own = list('a', 'gender', ['scs'], 'male');
    expect(locked(own, [own])).toBe(false);
    expect(locked(own, [own, list('t', 'title', ['system'])])).toBe(false);
  });
  it('is locked for a shared list, also before the app has loaded it', () => {
    expect(locked(list('b', 'gender', ['scs', 'kring']), [])).toBe(true);
    expect(locked(system, [system])).toBe(true);
  });
  it('is locked for a copy of a system list', () => {
    const copy = list('c', 'gender', ['scs'], 'male');
    expect(locked(copy, [system, copy])).toBe(true);
    expect(locked(copy, [system])).toBe(true);
  });
  it('is free for a new list, whatever is typed as its name', () => {
    expect(locked(list('', '', ['scs']), [system])).toBe(false);
  });
  it('judges the loaded list and compares the edited items', () => {
    const copy = list('c', 'gender', ['scs'], 'male');
    const edited = [...copy.items, new CategoryItemModel('female', 'x')];
    expect(categoryCopyStatus(copy, [copy, system], 'scs').missing).toEqual(['female', 'other']);
    expect(categoryCopyStatus(copy, [copy, system], 'scs', edited).missing).toEqual(['other']);
  });
  it('copes with a list stored without items', () => {
    const bare = { ...list('c', 'gender', ['scs']), items: undefined } as unknown as CategoryListModel;
    expect(categoryCopyStatus(bare, [system], 'scs').missing).toEqual(['male', 'female', 'other']);
  });
});

describe('withSharedItem', () => {
  it('appends a deep copy of the shared item', () => {
    const items = [new CategoryItemModel('male', 'm')];
    const result = withSharedItem(items, system, 'female');
    expect(result.map(i => i.name)).toEqual(['male', 'female']);
    expect(result[1]).toEqual(system.items[1]);
    expect(result[1]).not.toBe(system.items[1]);
    expect(items).toHaveLength(1);
  });
  it('changes nothing for an unknown item, a present one or no shared list', () => {
    const items = [new CategoryItemModel('male', 'm')];
    expect(withSharedItem(items, system, 'nope')).toBe(items);
    expect(withSharedItem(items, system, 'male')).toBe(items);
    expect(withSharedItem(items, undefined, 'female')).toBe(items);
  });
  it('satisfies the protection check for a protected item', () => {
    const items = [new CategoryItemModel('male', 'm')];
    expect(missingProtectedItems({ name: 'gender', items }, () => true)).toEqual(['female']);
    expect(missingProtectedItems({ name: 'gender', items: withSharedItem(items, system, 'female') }, () => true)).toEqual([]);
  });
});
