import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocationModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';
import { isLocation, convertLocationToForm, convertFormToLocation } from './location.util';
import { LocationFormModel } from './location-form.model';

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

  describe('convertLocationToForm', () => {
    it('should convert a LocationModel to a LocationFormModel', () => {
      const formModel = convertLocationToForm(location);
      expect(formModel.bkey).toBe('loc-1');
      expect(formModel.name).toBe('Main Office');
      expect(formModel.address).toBe('123 Main St');
    });
  });

  describe('convertFormToLocation', () => {
    let formModel: LocationFormModel;

    beforeEach(() => {
      formModel = {
        bkey: 'loc-1',
        name: 'Updated Office',
        address: '456 New Ave',
        latitude: '99999',
        longitude: '555555',
        what3words: 'new.bla.bla',
        notes: 'Updated notes',
      };
    });

    it('should update an existing LocationModel from a form model', () => {
      const updatedLocation = convertFormToLocation(location, formModel, tenantId);
      expect(updatedLocation.name).toBe('Updated Office');
      expect(updatedLocation.address).toBe('456 New Ave');
      expect(updatedLocation.latitude).toBe(99999);
      expect(updatedLocation.longitude).toBe(555555);
      expect(updatedLocation.what3words).toBe('new.bla.bla');
      expect(updatedLocation.notes).toBe('Updated notes');
    });

    it('should create a new LocationModel if one is not provided', () => {
      const newLocation = convertFormToLocation(undefined, formModel, tenantId);
      expect(newLocation).toBeInstanceOf(LocationModel);
      expect(newLocation.name).toBe('Updated Office');
      expect(newLocation.tenants[0]).toBe(tenantId);
    });
  });
});
