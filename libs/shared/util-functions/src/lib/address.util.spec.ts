import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { AddressChannel, AddressModel } from '@bk2/shared-models';
import { die, getCountryName } from '@bk2/shared-util-core';

import { getFavoriteAddressInfo, updateFavoriteAddressInfo } from './address.util';

// Mock all external dependencies
vi.mock('firebase-admin/firestore');
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  error: vi.fn(),
}));
vi.mock('@bk2/shared-util-core', () => ({
  die: vi.fn(),
  getCountryName: vi.fn(),
}));

// Mock the firebase-admin module
const mockUpdate = vi.fn();
const mockDoc = vi.fn(() => ({
  update: mockUpdate,
}));
vi.mock('firebase-admin', () => ({
  firestore: () => ({
    doc: mockDoc,
  }),
}));

describe('Address Utils', () => {
  const mockDie = vi.mocked(die);
  const mockGetCountryName = vi.mocked(getCountryName);
  const mockLoggerInfo = vi.mocked(logger.info);
  const mockLoggerError = vi.mocked(logger.error);

  // Mock Firestore query chain
  const mockWhere = vi.fn();
  const mockGet = vi.fn();
  const mockCollection = vi.fn(() => ({
    where: mockWhere,
    get: mockGet,
  }));
  const mockFirestore = {
    collection: mockCollection,
  } as unknown as Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockReturnThis(); // Allow chaining
  });

  describe('getFavoriteAddressInfo', () => {
    it('should return empty info if no favorite addresses are found', async () => {
      mockGet.mockResolvedValue({ empty: true, docs: [] });
      const result = await getFavoriteAddressInfo(mockFirestore, 'parent-1', 'persons');
      expect(result).toEqual({
        fav_email: '',
        fav_phone: '',
        fav_street: '',
        fav_zip: '',
        fav_city: '',
        fav_country: '',
        fav_web: '',
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith('getFavoriteAddressInfo: no favorite addresses found for persons/parent-1)');
    });

    function createMockDocs(favs: AddressModel[]) {
      return favs.map((fav, i) => ({ id: `doc${i}`, data: () => fav }));
    }

    it('should correctly populate info from multiple favorite addresses', async () => {
      const favs: AddressModel[] = [
        { channelType: AddressChannel.Email, addressValue: 'test@example.com' },
        { channelType: AddressChannel.Phone, addressValue: '123-456-7890' },
        { channelType: AddressChannel.Postal, addressValue: '123 Main St', zipCode: '90210', city: 'Beverly Hills', countryCode: 'US' },
        { channelType: AddressChannel.Web, url: 'http://example.com' },
      ] as AddressModel[];
      const mockDocs = createMockDocs(favs);
      mockGet.mockResolvedValue({ empty: false, docs: mockDocs });
      mockGetCountryName.mockReturnValue('United States');

      const result = await getFavoriteAddressInfo(mockFirestore, 'parent-1', 'persons');

      expect(result.fav_email).toBe('test@example.com');
      expect(result.fav_phone).toBe('123-456-7890');
      expect(result.fav_street).toBe('123 Main St');
      expect(result.fav_zip).toBe('90210');
      expect(result.fav_city).toBe('Beverly Hills');
      expect(result.fav_country).toBe('United States');
    });

    it('should call die for an unknown channel type', async () => {
      const favs = [{ channelType: 99 }]; // Invalid channel type
      const mockDocs = createMockDocs(favs);
      mockGet.mockResolvedValue({ empty: false, docs: mockDocs });

      await getFavoriteAddressInfo(mockFirestore, 'parent-1', 'persons');

      expect(mockDie).toHaveBeenCalledWith('AddressUtil.getEmptyFavoriteAddressInfo: unknown channel type 99');
    });

    it('should get favorite info and update the parent document', async () => {
      // This test re-uses the mocks from the getFavoriteAddressInfo test above
      const favs: AddressModel[] = [{ channelType: AddressChannel.Email, addressValue: 'test@example.com' }];
      const mockDocs = createMockDocs(favs);
      mockGet.mockResolvedValue({ empty: false, docs: mockDocs });
      mockUpdate.mockResolvedValue({});

      await updateFavoriteAddressInfo(mockFirestore, 'parent-1', 'persons', 'person');

      expect(mockDoc).toHaveBeenCalledWith('persons/parent-1');
      expect(mockUpdate).toHaveBeenCalledWith({
        fav_email: 'test@example.com',
        fav_phone: '',
        fav_street: '',
        fav_zip: '',
        fav_city: '',
        fav_country: '',
      });
      expect(mockLoggerInfo).toHaveBeenCalledWith('Successfully updated favorite address info for person parent-1');
    });

    it('should log an error if the update fails', async () => {
      const error = new Error('Update failed');
      mockGet.mockResolvedValue({ empty: true, docs: [] }); // Assume no favs for simplicity
      mockUpdate.mockRejectedValue(error);

      await updateFavoriteAddressInfo(mockFirestore, 'parent-1', 'persons', 'person');

      expect(mockLoggerError).toHaveBeenCalledWith('Error updating person parent-1:', error);
    });
  });
});
