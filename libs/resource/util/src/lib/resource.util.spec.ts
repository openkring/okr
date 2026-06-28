import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceModel } from '@bk2/shared-models';
import {
  getResourceIndex,
  getResourceIndexInfo,
  isReservable,
  getKeyNr,
  getLockerNr,
  getCategoryNameForResourceType,
  getUsageNameForResourceType,
} from './resource.util';

describe('Resource Utils', () => {
  const tenantId = 'tenant-1';
  let resource: ResourceModel;

  beforeEach(() => {
    resource = new ResourceModel(tenantId);
    resource.bkey = 'res-1';
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
