import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocationModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { isLocation } from './location.util';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
  };
});

describe('Location Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const tenantId = 'tenant-1';
  let location: LocationModel;

  beforeEach(() => {
    vi.clearAllMocks();
    location = new LocationModel(tenantId);
    location.bkey = 'loc-1';
    location.name = 'Main Office';
    location.address = '123 Main St';
    location.latitude = 12345;
    location.longitude = 67890;
    location.what3words = 'bla.bla.bla';
    location.notes = 'Some notes';
  });

  describe('isLocation', () => {
    it('should use the isType utility to check the object type', () => {
      mockIsType.mockReturnValue(true);
      expect(isLocation({}, tenantId)).toBe(true);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(LocationModel));

      mockIsType.mockReturnValue(false);
      expect(isLocation({}, tenantId)).toBe(false);
    });
  });
});
