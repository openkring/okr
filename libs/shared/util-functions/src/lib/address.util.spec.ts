import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

import { AddressModel } from '@okr/shared-models';

import { demoteFavorites, findFavoritesToDemote, getActiveAddresses, getFavoriteZipCode, getScalarChannelValue, parseParentKey, updateFavoriteZipCode } from './address.util';

vi.mock('firebase-admin/firestore');
vi.mock('firebase-functions/logger', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

describe('Address Utils', () => {
  const mockLoggerError = vi.mocked(logger.error);
  const mockLoggerWarn = vi.mocked(logger.warn);

  // parent document handle (firestore.doc(...))
  const mockParentGet = vi.fn();
  const mockParentUpdate = vi.fn();
  const mockDoc = vi.fn(() => ({ get: mockParentGet, update: mockParentUpdate }));

  // address query chain (firestore.collection(...).where(...).get())
  const mockWhere = vi.fn();
  const mockGet = vi.fn();
  const mockCollection = vi.fn(() => ({ where: mockWhere, get: mockGet }));

  const mockFirestore = {
    collection: mockCollection,
    doc: mockDoc,
  } as unknown as Firestore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWhere.mockReturnValue({ get: mockGet });
  });

  function address(partial: Partial<AddressModel>): AddressModel {
    return { parentKey: 'person.p1', isArchived: false, ...partial } as AddressModel;
  }

  describe('parseParentKey', () => {
    it('splits a person key', () => {
      expect(parseParentKey('person.p1')).toEqual({ parentType: 'person', parentId: 'p1', parentCollection: 'persons' });
    });

    it('splits an org key', () => {
      expect(parseParentKey('org.o1')).toEqual({ parentType: 'org', parentId: 'o1', parentCollection: 'orgs' });
    });

    it('returns undefined for any other prefix', () => {
      expect(parseParentKey('resource.r1')).toBeUndefined();
      expect(parseParentKey('')).toBeUndefined();
    });
  });

  describe('getActiveAddresses', () => {
    it('drops archived addresses (archive is the app delete)', async () => {
      mockGet.mockResolvedValue({
        docs: [
          { id: 'a1', data: () => ({ addressChannel: 'postal', zipCode: '8712', isArchived: false }) },
          { id: 'a2', data: () => ({ addressChannel: 'postal', zipCode: '8000', isArchived: true }) },
        ],
      });

      const result = await getActiveAddresses(mockFirestore, 'person.p1');

      expect(mockCollection).toHaveBeenCalledWith('addresses');
      expect(mockWhere).toHaveBeenCalledWith('parentKey', '==', 'person.p1');
      expect(result.map((a) => a.okey)).toEqual(['a1']);
    });
  });

  describe('getFavoriteZipCode', () => {
    it('returns the zip of the favorite postal address', () => {
      expect(getFavoriteZipCode([
        address({ addressChannel: 'postal', zipCode: '8000', isFavorite: false }),
        address({ addressChannel: 'postal', zipCode: '8712', isFavorite: true }),
      ])).toBe('8712');
    });

    it('ignores favorites of other channels', () => {
      expect(getFavoriteZipCode([
        address({ addressChannel: 'email', email: 'a@b.ch', isFavorite: true }),
      ])).toBe('');
    });

    it('returns an empty string when no postal address is flagged', () => {
      expect(getFavoriteZipCode([address({ addressChannel: 'postal', zipCode: '8712', isFavorite: false })])).toBe('');
      expect(getFavoriteZipCode([])).toBe('');
    });
  });

  describe('getScalarChannelValue', () => {
    it('returns the value of the scalar channel', () => {
      expect(getScalarChannelValue([address({ okey: 'a1', addressChannel: 'dob', dob: '19630704' })], 'dob')).toBe('19630704');
    });

    it('returns an empty string when the channel is absent (a deleted dob clears its replica)', () => {
      expect(getScalarChannelValue([address({ addressChannel: 'email', email: 'a@b.ch' })], 'dob')).toBe('');
      expect(getScalarChannelValue([], 'dod')).toBe('');
    });

    it('picks deterministically (lowest okey) and warns when duplicates exist', () => {
      const result = getScalarChannelValue([
        address({ okey: 'b', addressChannel: 'dob', dob: '19700101' }),
        address({ okey: 'a', addressChannel: 'dob', dob: '19630704' }),
      ], 'dob');

      expect(result).toBe('19630704');
      expect(mockLoggerWarn).toHaveBeenCalled();
    });

    it('skips docs of the right channel that carry no value', () => {
      expect(getScalarChannelValue([
        address({ okey: 'a', addressChannel: 'dob', dob: '' }),
        address({ okey: 'b', addressChannel: 'dob', dob: '19630704' }),
      ], 'dob')).toBe('19630704');
    });
  });

  describe('updateFavoriteZipCode', () => {
    it('returns early (no read, no write) when the parentKey is neither person. nor org.', async () => {
      await updateFavoriteZipCode(mockFirestore, 'unknown.parent-1', []);

      expect(mockParentGet).not.toHaveBeenCalled();
      expect(mockParentUpdate).not.toHaveBeenCalled();
    });

    it('writes the favorite zip code onto the parent person', async () => {
      mockParentGet.mockResolvedValue({ exists: true, data: () => ({ favZipCode: '8000' }) });
      mockParentUpdate.mockResolvedValue({});

      await updateFavoriteZipCode(mockFirestore, 'person.parent-1', [
        address({ addressChannel: 'postal', zipCode: '8712', isFavorite: true }),
      ]);

      expect(mockDoc).toHaveBeenCalledWith('persons/parent-1');
      expect(mockParentUpdate).toHaveBeenCalledWith({ favZipCode: '8712' });
    });

    it('clears the zip code on the parent org when no favorite postal address is left', async () => {
      mockParentGet.mockResolvedValue({ exists: true, data: () => ({ favZipCode: '8712' }) });
      mockParentUpdate.mockResolvedValue({});

      await updateFavoriteZipCode(mockFirestore, 'org.parent-2', []);

      expect(mockDoc).toHaveBeenCalledWith('orgs/parent-2');
      expect(mockParentUpdate).toHaveBeenCalledWith({ favZipCode: '' });
    });

    it('skips the write when the zip code is unchanged (no onPersonChange fan-out)', async () => {
      mockParentGet.mockResolvedValue({ exists: true, data: () => ({ favZipCode: '8712' }) });

      await updateFavoriteZipCode(mockFirestore, 'person.parent-1', [
        address({ addressChannel: 'postal', zipCode: '8712', isFavorite: true }),
      ]);

      expect(mockParentUpdate).not.toHaveBeenCalled();
    });

    it('does not write when the parent document is gone', async () => {
      mockParentGet.mockResolvedValue({ exists: false, data: () => undefined });

      await updateFavoriteZipCode(mockFirestore, 'person.parent-1', []);

      expect(mockParentUpdate).not.toHaveBeenCalled();
    });

    it('logs an error if the update fails', async () => {
      const error = new Error('Update failed');
      mockParentGet.mockResolvedValue({ exists: true, data: () => ({ favZipCode: '8000' }) });
      mockParentUpdate.mockRejectedValue(error);

      await updateFavoriteZipCode(mockFirestore, 'person.parent-1', []);

      expect(mockLoggerError).toHaveBeenCalledWith('Error updating persons/parent-1:', error);
    });
  });

  describe('findFavoritesToDemote', () => {
    const okeys = (addresses: AddressModel[]) => addresses.map((a) => a.okey);

    it('returns nothing when every channel has at most one favorite', () => {
      const addresses = [
        address({ okey: 'a1', addressChannel: 'email', isFavorite: true }),
        address({ okey: 'a2', addressChannel: 'phone', isFavorite: true }),
        address({ okey: 'a3', addressChannel: 'email', isFavorite: false }),
      ];
      expect(findFavoritesToDemote(addresses, 'a1')).toEqual([]);
    });

    it('keeps the doc that triggered the write and demotes the rest', () => {
      const addresses = [
        address({ okey: 'a1', addressChannel: 'email', isFavorite: true }),
        address({ okey: 'a2', addressChannel: 'email', isFavorite: true }),
        address({ okey: 'a3', addressChannel: 'email', isFavorite: true }),
      ];
      expect(okeys(findFavoritesToDemote(addresses, 'a2'))).toEqual(['a1', 'a3']);
    });

    it('falls back to the lowest okey when the trigger doc is not a favorite', () => {
      const addresses = [
        address({ okey: 'b2', addressChannel: 'phone', isFavorite: true }),
        address({ okey: 'b1', addressChannel: 'phone', isFavorite: true }),
      ];
      // 'b9' triggered the write (e.g. a bulk import) but is not among the favorites
      expect(okeys(findFavoritesToDemote(addresses, 'b9'))).toEqual(['b2']);
      expect(okeys(findFavoritesToDemote(addresses))).toEqual(['b2']);
    });

    it('resolves each channel independently', () => {
      const addresses = [
        address({ okey: 'e1', addressChannel: 'email', isFavorite: true }),
        address({ okey: 'e2', addressChannel: 'email', isFavorite: true }),
        address({ okey: 'p1', addressChannel: 'postal', isFavorite: true }),
        address({ okey: 'p2', addressChannel: 'postal', isFavorite: true }),
      ];
      expect(okeys(findFavoritesToDemote(addresses, 'e2'))).toEqual(['e1', 'p2']);
    });

    it('ignores non-favorites entirely', () => {
      const addresses = [
        address({ okey: 'a1', addressChannel: 'email', isFavorite: false }),
        address({ okey: 'a2', addressChannel: 'email', isFavorite: false }),
      ];
      expect(findFavoritesToDemote(addresses, 'a1')).toEqual([]);
    });

    it('treats CC addresses like any other favorite (matches demoteOtherFavorites)', () => {
      const addresses = [
        address({ okey: 'a1', addressChannel: 'email', isFavorite: true, isCc: true }),
        address({ okey: 'a2', addressChannel: 'email', isFavorite: true }),
      ];
      expect(okeys(findFavoritesToDemote(addresses, 'a2'))).toEqual(['a1']);
    });
  });

  describe('demoteFavorites', () => {
    // vi.clearAllMocks() clears calls but NOT implementations, so an earlier
    // mockRejectedValue would otherwise leak into these tests
    beforeEach(() => {
      mockParentUpdate.mockResolvedValue(undefined);
    });

    it('clears the flag in the database and in the caller\'s list', async () => {
      const addresses = [
        address({ okey: 'a1', addressChannel: 'email', isFavorite: true }),
        address({ okey: 'a2', addressChannel: 'email', isFavorite: true }),
      ];

      const demoted = await demoteFavorites(mockFirestore, addresses, 'a2');

      expect(demoted).toBe(1);
      expect(mockDoc).toHaveBeenCalledWith('addresses/a1');
      expect(mockParentUpdate).toHaveBeenCalledWith({ isFavorite: false });
      // the in-memory list must reflect the fix: the zip code and the projection are
      // derived from it later in the same trigger pass
      expect(addresses[0].isFavorite).toBe(false);
      expect(addresses[1].isFavorite).toBe(true);
    });

    it('writes nothing when the invariant already holds', async () => {
      const addresses = [address({ okey: 'a1', addressChannel: 'email', isFavorite: true })];

      expect(await demoteFavorites(mockFirestore, addresses, 'a1')).toBe(0);
      expect(mockParentUpdate).not.toHaveBeenCalled();
    });

    it('logs and continues when a demotion write fails', async () => {
      const error = new Error('Update failed');
      mockParentUpdate.mockRejectedValue(error);
      const addresses = [
        address({ okey: 'a1', addressChannel: 'email', isFavorite: true }),
        address({ okey: 'a2', addressChannel: 'email', isFavorite: true }),
      ];

      await demoteFavorites(mockFirestore, addresses, 'a2');

      expect(mockLoggerError).toHaveBeenCalledWith('demoteFavorites: could not demote a1:', error);
      expect(addresses[0].isFavorite).toBe(true); // unchanged: the write did not land
    });
  });
});
