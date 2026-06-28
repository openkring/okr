import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { AddressModel } from '@bk2/shared-models';

import { updateFavoriteAddressInfo } from './address.util';

// Mock all external dependencies
vi.mock('firebase-admin/firestore');
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  error: vi.fn(),
}));

// Mock the firebase-admin module (used for the parent-document update)
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
  const mockLoggerInfo = vi.mocked(logger.info);
  const mockLoggerError = vi.mocked(logger.error);

  // Mock Firestore query chain used to fetch the favorite addresses
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

  function makeAddress(parentKey: string): AddressModel {
    return { parentKey } as AddressModel;
  }

  function createMockDocs(favs: Partial<AddressModel>[]) {
    return favs.map((fav, i) => ({ id: `doc${i}`, data: () => fav }));
  }

  describe('updateFavoriteAddressInfo', () => {
    it('returns early (no update) when the parentKey is neither person. nor org.', async () => {
      await updateFavoriteAddressInfo(mockFirestore, makeAddress('unknown.parent-1'), 'addr-1');

      expect(mockGet).not.toHaveBeenCalled();
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('updates the parent person document with empty favorites when none are found', async () => {
      mockGet.mockResolvedValue({ empty: true, docs: [] });
      mockUpdate.mockResolvedValue({});

      await updateFavoriteAddressInfo(mockFirestore, makeAddress('person.parent-1'), 'addr-1');

      expect(mockCollection).toHaveBeenCalledWith('addresses');
      expect(mockDoc).toHaveBeenCalledWith('persons/parent-1');
      expect(mockUpdate).toHaveBeenCalledWith({
        favEmail: '',
        favPhone: '',
        favZipCode: '',
      });
    });

    it('populates favorite info from the favorite addresses and updates the parent document', async () => {
      const favs: Partial<AddressModel>[] = [
        { addressChannel: 'email', email: 'test@example.com' },
        { addressChannel: 'phone', phone: '123-456-7890' },
        { addressChannel: 'postal', zipCode: '90210' },
      ];
      mockGet.mockResolvedValue({ empty: false, docs: createMockDocs(favs) });
      mockUpdate.mockResolvedValue({});

      await updateFavoriteAddressInfo(mockFirestore, makeAddress('org.parent-2'), 'addr-2');

      expect(mockDoc).toHaveBeenCalledWith('orgs/parent-2');
      expect(mockUpdate).toHaveBeenCalledWith({
        favEmail: 'test@example.com',
        favPhone: '123-456-7890',
        favZipCode: '90210',
      });
    });

    it('logs an error if the update fails', async () => {
      const error = new Error('Update failed');
      mockGet.mockResolvedValue({ empty: true, docs: [] });
      mockUpdate.mockRejectedValue(error);

      await updateFavoriteAddressInfo(mockFirestore, makeAddress('person.parent-1'), 'addr-1');

      expect(mockLoggerError).toHaveBeenCalledWith('Error updating persons/parent-1:', error);
    });

    it('logs that no favorite addresses were found', async () => {
      mockGet.mockResolvedValue({ empty: true, docs: [] });
      mockUpdate.mockResolvedValue({});

      await updateFavoriteAddressInfo(mockFirestore, makeAddress('person.parent-1'), 'addr-1');

      expect(mockLoggerInfo).toHaveBeenCalledWith('getFavoriteAddressInfo: no favorite addresses found for person.parent-1');
    });
  });
});
