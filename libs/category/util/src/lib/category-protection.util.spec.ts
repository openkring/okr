import { describe, expect, it } from 'vitest';

import { categoryListValidations } from './category.validations';
import { missingProtectedItems, protectedItems, removalWarning } from './category-protection.util';

const on = () => true;
const off = () => false;

describe('protectedItems', () => {
  it('lists the names code compares by', () => {
    expect(protectedItems('address_channel', on)).toEqual(['email', 'phone']);
    expect(protectedItems('address_usage', on)).toEqual(['home', 'custom']);
    expect(protectedItems('gender', on)).toEqual(['male', 'female']);
    expect(protectedItems('org_type', on)).toEqual(['association', 'legalEntity', 'other']);
  });
  it('adds rboat to resource_type only while the trip block is on', () => {
    expect(protectedItems('resource_type', on)).toEqual(['other', 'rboat']);
    expect(protectedItems('resource_type', off)).toEqual(['other']);
    expect(protectedItems('resource_type', b => b === 'trip')).toEqual(['other', 'rboat']);
    expect(protectedItems('resource_type', b => b === 'finance')).toEqual(['other']);
  });
  it('protects nothing in other lists', () => {
    expect(protectedItems('mcat', on)).toEqual([]);
  });
});

describe('missingProtectedItems', () => {
  const item = (name: string) => ({ name, icon: 'x' });
  it('names the protected items the list lacks', () => {
    expect(missingProtectedItems({ name: 'gender', items: [item('male')] } as never, on)).toEqual(['female']);
    expect(missingProtectedItems({ name: 'gender', items: [item('male'), item('female'), item('other')] } as never, on)).toEqual([]);
  });
  it('treats a list without items as lacking all', () => {
    expect(missingProtectedItems({ name: 'address_usage', items: undefined } as never, on)).toEqual(['home', 'custom']);
  });
  it('ignores an unprotected list', () => {
    expect(missingProtectedItems({ name: 'mcat', items: [] } as never, on)).toEqual([]);
  });

  describe('of a stored list', () => {
    const list = (name: string, okey: string, ...names: string[]) => ({ okey, name, items: names.map(item) }) as never;
    const isValid = (edited: never, loaded: never, isEnabled: (block: string) => boolean = on) =>
      !categoryListValidations(edited, 'scs', '', missingProtectedItems(edited, isEnabled, loaded)).hasErrors('items');

    it('can be saved without an item it never had', () => {
      const loaded = list('org_type', 'o1', 'association', 'other');
      expect(isValid(list('org_type', 'o1', 'association', 'other', 'foundation'), loaded)).toBe(true);
    });
    it('rejects the removal of an item it had, and only that one', () => {
      const loaded = list('org_type', 'o1', 'association', 'other');
      expect(missingProtectedItems(list('org_type', 'o1', 'other'), on, loaded)).toEqual(['association']);
      expect(isValid(list('org_type', 'o1', 'other'), loaded)).toBe(false);
    });
    it('rejects a rename of an item it had', () => {
      const loaded = list('gender', 'g1', 'male', 'female');
      expect(isValid(list('gender', 'g1', 'man', 'female'), loaded)).toBe(false);
    });
    it('accepts an item that was removed and added back', () => {
      const loaded = list('org_type', 'o1', 'association', 'other');
      expect(isValid(list('org_type', 'o1', 'other', 'association'), loaded)).toBe(true);
    });
    it('stays saveable when a block that protects an item is switched on later', () => {
      const loaded = list('resource_type', 'r1', 'other', 'car');
      expect(isValid(list('resource_type', 'r1', 'other', 'car', 'bike'), loaded, b => b === 'trip')).toBe(true);
    });
    it('is fully checked while it is new', () => {
      const loaded = list('gender', '', 'female');
      expect(missingProtectedItems(list('gender', '', 'female', 'other'), on, loaded)).toEqual(['male']);
      expect(isValid(list('gender', '', 'female', 'other'), loaded)).toBe(false);
    });
    it('of which no items were loaded requires none', () => {
      expect(missingProtectedItems(list('gender', 'g1', 'other'), on, { okey: 'g1', name: 'gender', items: undefined } as never)).toEqual([]);
    });
  });
});

describe('removalWarning', () => {
  it('warns for postal and bankaccount while finance is on', () => {
    expect(removalWarning('address_channel', 'postal', b => b === 'finance')).toBe('postal');
    expect(removalWarning('address_channel', 'bankaccount', b => b === 'finance')).toBe('bankaccount');
  });
  it('is silent with finance off, for other items and other lists', () => {
    expect(removalWarning('address_channel', 'postal', off)).toBeUndefined();
    expect(removalWarning('address_channel', 'web', on)).toBeUndefined();
    expect(removalWarning('gender', 'postal', on)).toBeUndefined();
  });
});

describe('categoryListValidations items', () => {
  const model = { name: 'address_channel', i18n: 'x', items: [], tenants: ['scs'], tags: '' } as never;
  it('files an error under items for a missing protected item', () => {
    const res = categoryListValidations(model, 'scs', '', ['email']);
    expect(res.getErrors('items')).toEqual(['@category/feature.items.missing']);
  });
  it('has no items error when nothing is missing', () => {
    expect(categoryListValidations(model, 'scs', '', []).getErrors('items')).toEqual([]);
  });
});
