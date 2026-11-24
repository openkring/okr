import { describe, it, expect, beforeEach } from 'vitest';
import { CategoryItemModel, CategoryListModel, ResourceModel } from '@okr/shared-models';
import {
  applyResourceType,
  getResourceIndex,
  getResourceIndexInfo,
  isReservable,
  getKeyNr,
  getLockerNr,
  getCategoryNameForResourceType,
  getDefaultForResourceType,
  getUsageNameForResourceType,
} from './resource.util';

describe('Resource Utils', () => {
  const tenantId = 'tenant-1';
  let resource: ResourceModel;

  beforeEach(() => {
    resource = new ResourceModel(tenantId);
    resource.okey = 'res-1';
    resource.name = 'My Boat';
    resource.type = 'rboat';
    resource.subType = 'b1x';
  });

  describe('getResourceIndex', () => {
    it('builds an index from name, type and subType', () => {
      expect(getResourceIndex(resource)).toBe('n:My Boat t:rboat st:b1x');
    });
  });

  describe('getResourceIndexInfo', () => {
    it('describes the index structure', () => {
      expect(getResourceIndexInfo()).toBe('n:name c:type st:subtype');
    });
  });

  describe('isReservable', () => {
    it('is true for boats and cars, false for lockers and keys', () => {
      expect(isReservable('rboat')).toBe(true);
      expect(isReservable('car')).toBe(true);
      expect(isReservable('locker')).toBe(false);
      expect(isReservable('key')).toBe(false);
    });
  });

  describe('getKeyNr / getLockerNr', () => {
    it('parses locker name "12/34" into locker and key numbers', () => {
      resource.type = 'locker';
      resource.name = '12/34';
      expect(getLockerNr(resource)).toBe(12);
      expect(getKeyNr(resource)).toBe(34);
    });

    it('returns 0 for non-locker resources', () => {
      expect(getLockerNr(resource)).toBe(0);
      expect(getKeyNr(resource)).toBe(0);
    });
  });

  describe('category / usage name for resource type', () => {
    it('maps rboat to its category and usage', () => {
      expect(getCategoryNameForResourceType('rboat')).toBe('rboat_type');
      expect(getUsageNameForResourceType('rboat')).toBe('rboat_usage');
    });

    it('returns undefined for types without a category/usage', () => {
      expect(getCategoryNameForResourceType('key')).toBeUndefined();
      expect(getUsageNameForResourceType('car')).toBeUndefined();
    });
  });
});

describe('applyResourceType', () => {
  const list = (...names: string[]) => ({ items: names.map(n => new CategoryItemModel(n, '')) }) as CategoryListModel;
  const lists: Record<string, CategoryListModel> = {
    rboat_type: list('b2x', 'b4x'),
    car_type: list('van', 'sedan'),
    rboat_usage: list('regatta', 'breitensport'),
  };
  const lookup = (name: string) => lists[name];
  const resource = (type: string, subType: string, usage = 'breitensport') => Object.assign(new ResourceModel('t'), { type, subType, usage });

  it('replaces a subType the new type does not offer by the first item', () => {
    expect(applyResourceType(resource('rboat', 'b1x'), 'rboat', lookup, 2026).subType).toBe('b2x');
  });

  it('drops the leftover subType of the previous type', () => {
    expect(applyResourceType(resource('rboat', 'b2x'), 'car', lookup, 2026).subType).toBe('van');
  });

  it('keeps a subType the new type offers', () => {
    expect(applyResourceType(resource('rboat', 'b4x'), 'rboat', lookup, 2026).subType).toBe('b4x');
  });

  it('clears the leftover subType when the new type has no subtype list', () => {
    expect(applyResourceType(resource('rboat', 'b1x'), 'key', lookup, 2026).subType).toBe('');
  });

  it('falls back to the default of the new type when the tenant lacks its list', () => {
    expect(applyResourceType(resource('rboat', 'b1x'), 'car', () => undefined, 2026).subType).toBe(getDefaultForResourceType('car'));
    expect(applyResourceType(resource('rboat', 'b1x'), 'car', () => list(), 2026).subType).toBe(getDefaultForResourceType('car'));
  });

  it('keeps the subType when the type stays the same and has no subtype list', () => {
    expect(applyResourceType(resource('boat', 'sail'), 'boat', lookup, 2026).subType).toBe('sail');
  });

  it('leaves subType alone while the list is empty (categories loading)', () => {
    expect(applyResourceType(resource('rboat', 'b1x'), 'rboat', () => list(), 2026).subType).toBe('b1x');
  });

  it('replaces an unknown rowing-boat usage by the preferred or first item and keeps a known one', () => {
    expect(applyResourceType(resource('rboat', 'b2x', 'misc'), 'rboat', lookup, 2026).usage).toBe('breitensport');
    expect(applyResourceType(resource('rboat', 'b2x', '2026:regatta'), 'rboat', lookup, 2026).usage).toBe('2026:regatta');
  });

  it('does not touch usage for a type without usage list', () => {
    expect(applyResourceType(resource('rboat', 'b2x', 'misc'), 'car', lookup, 2026).usage).toBe('misc');
  });

  it('sets the type and does not mutate the input', () => {
    const input = resource('rboat', 'b2x');
    expect(applyResourceType(input, 'car', lookup, 2026).type).toBe('car');
    expect(input.type).toBe('rboat');
  });
});
