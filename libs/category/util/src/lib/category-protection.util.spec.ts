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
