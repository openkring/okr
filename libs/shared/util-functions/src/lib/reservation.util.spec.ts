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
    it('should call searchData with the correct query for a reserverId', async () => {
      const reserverId = 'user-123';
      const expectedQuery = [{ key: 'reserverKey', operator: '==', value: reserverId }];

      await getAllReservationsOfReserver(mockFirestore, reserverId);

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, ReservationCollection, expectedQuery);
    });

    it('should return the reservations found by searchData', async () => {
      const reserverId = 'user-123';
      const mockReservations: ReservationModel[] = [{ reserverKey: reserverId, resourceKey: 'resource-1' } as ReservationModel, { reserverKey: reserverId, resourceKey: 'resource-2' } as ReservationModel];
      mockSearchData.mockResolvedValue(mockReservations);

      const result = await getAllReservationsOfReserver(mockFirestore, reserverId);

      expect(result).toEqual(mockReservations);
      expect(result.length).toBe(2);
    });
  });

  describe('getAllReservationsOfResource', () => {
    it('should call searchData with the correct query for a resourceId', async () => {
      const resourceId = 'resource-456';
      const expectedQuery = [{ key: 'resourceKey', operator: '==', value: resourceId }];

      await getAllReservationsOfResource(mockFirestore, resourceId);

      expect(mockSearchData).toHaveBeenCalledWith(mockFirestore, ReservationCollection, expectedQuery);
    });

    it('should return the reservations found by searchData', async () => {
      const resourceId = 'resource-456';
      const mockReservations: ReservationModel[] = [{ reserverKey: 'user-1', resourceKey: resourceId } as ReservationModel, { reserverKey: 'user-2', resourceKey: resourceId } as ReservationModel];
      mockSearchData.mockResolvedValue(mockReservations);

      const result = await getAllReservationsOfResource(mockFirestore, resourceId);

      expect(result).toEqual(mockReservations);
      expect(result.length).toBe(2);
    });
  });
});
