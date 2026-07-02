import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAllReservationsOfReserver, getAllReservationsOfResource } from './reservation.util';
import { searchData } from './search.util';
import { ReservationCollection, ReservationModel } from '@bk2/shared-models';
import { Firestore } from 'firebase-admin/firestore';

// Mock the searchData utility
vi.mock('./search.util', () => ({
  searchData: vi.fn(),
}));

describe('Reservation Utils', () => {
  const mockSearchData = vi.mocked(searchData);
  const mockFirestore = {} as Firestore; // A simple mock object is sufficient

  beforeEach(() => {
    // Clear mocks before each test
    mockSearchData.mockClear();
  });

  describe('getAllReservationsOfReserver', () => {
    it('should query the nested reserver.key / reserver.modelType paths', async () => {
      const reserverId = 'user-123';
      const expectedQuery = [
        { key: 'reserver.key', operator: '==', value: reserverId },
        { key: 'reserver.modelType', operator: '==', value: 'person' },
      ];

      await getAllReservationsOfReserver(mockFirestore, reserverId, 'person');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, ReservationCollection, expectedQuery, 'startDate', 'asc');
    });

    it('should filter by reserver.modelType=org (key collision guard)', async () => {
      const reserverId = 'scs';
      const expectedQuery = [
        { key: 'reserver.key', operator: '==', value: reserverId },
        { key: 'reserver.modelType', operator: '==', value: 'org' },
      ];

      await getAllReservationsOfReserver(mockFirestore, reserverId, 'org');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, ReservationCollection, expectedQuery, 'startDate', 'asc');
    });

    it('should return the reservations found by searchData', async () => {
      const reserverId = 'user-123';
      const mockReservations: ReservationModel[] = [{ name: 'r1' } as ReservationModel, { name: 'r2' } as ReservationModel];
      mockSearchData.mockResolvedValue(mockReservations);

      const result = await getAllReservationsOfReserver(mockFirestore, reserverId, 'person');

      expect(result).toEqual(mockReservations);
      expect(result.length).toBe(2);
    });
  });

  describe('getAllReservationsOfResource', () => {
    it('should query the nested resource.key / resource.modelType paths', async () => {
      const resourceId = 'resource-456';
      const expectedQuery = [
        { key: 'resource.key', operator: '==', value: resourceId },
        { key: 'resource.modelType', operator: '==', value: 'resource' },
      ];

      await getAllReservationsOfResource(mockFirestore, resourceId, 'resource');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, ReservationCollection, expectedQuery, 'startDate', 'asc');
    });

    it('should filter by resource.modelType=account (key collision guard)', async () => {
      const resourceId = 'acc-1';
      const expectedQuery = [
        { key: 'resource.key', operator: '==', value: resourceId },
        { key: 'resource.modelType', operator: '==', value: 'account' },
      ];

      await getAllReservationsOfResource(mockFirestore, resourceId, 'account');

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, ReservationCollection, expectedQuery, 'startDate', 'asc');
    });

    it('should return the reservations found by searchData', async () => {
      const resourceId = 'resource-456';
      const mockReservations: ReservationModel[] = [{ name: 'r1' } as ReservationModel, { name: 'r2' } as ReservationModel];
      mockSearchData.mockResolvedValue(mockReservations);

      const result = await getAllReservationsOfResource(mockFirestore, resourceId, 'resource');

      expect(result).toEqual(mockReservations);
      expect(result.length).toBe(2);
    });
  });
});
