import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarModelTypes, OrgModel, PersonModel, ReservationModel, ResourceModel, UserModel } from '@okr/shared-models';
import * as coreUtils from '@okr/shared-util-core';

import { getReservationIndex, getReservationIndexInfo, isReservation, isReservationOpen } from './reservation.util';

// Mock shared utility functions
vi.mock('@okr/shared-util-core', async importOriginal => {
  const actual = await importOriginal<typeof coreUtils>();
  return {
    ...actual,
    isType: vi.fn(),
    die: vi.fn(),
    getTodayStr: vi.fn().mockReturnValue('20250904'),
    addIndexElement: (index: string, key: string, value: string) => `${index} ${key}:${value}`.trim(),
  };
});

// Proactively mock shared-i18n to prevent Angular compiler errors
vi.mock('@okr/shared-i18n', () => ({
  okrTranslate: vi.fn(),
}));

describe('Reservation Utils', () => {
  const mockIsType = vi.mocked(coreUtils.isType);
  const mockDie = vi.mocked(coreUtils.die);

  const tenantId = 'tenant-1';
  let reservation: ReservationModel;
  let person: PersonModel;
  let org: OrgModel;
  let resource: ResourceModel;
  let currentUser: UserModel;

  beforeEach(() => {
    vi.clearAllMocks();

    reservation = new ReservationModel(tenantId);
    reservation.okey = 'res-1';
    reservation.name = 'Team Training';
    const reserverAvatar = {
      key: 'person-1',
      name1: 'John',
      name2: 'Doe',
      modelType: 'person' as AvatarModelTypes,
      type: 'male',
      subType: '',
      label: 'JD'
    } 
    reservation.reserver = reserverAvatar;
    const resourceAvatar = {
      key: 'resource-1',
      name1: 'Boat',
      name2: 'A',
      modelType: 'resource' as AvatarModelTypes,
      type: 'rboat',
      subType: 'b1x',
      label: 'Boat A'
    };
    reservation.resource = resourceAvatar;

    // tbd: calevent

    person = new PersonModel(tenantId);
    person.okey = 'person-1';
    person.firstName = 'Jane';
    person.lastName = 'Doe';
    person.gender = 'female';

    org = new OrgModel(tenantId);
    org.okey = 'org-1';
    org.name = 'Rowing Club';

    resource = new ResourceModel(tenantId);
    resource.okey = 'resource-1';
    resource.name = 'Single Scull';
    resource.type = 'rboat';
    resource.subType = 'b1x';

    currentUser = new UserModel(tenantId);
    currentUser.okey = 'user-1';
  });

  describe('isReservation', () => {
    it('should call isType with the correct parameters', () => {
      isReservation({}, tenantId);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(ReservationModel));
    });
  });

  describe('isReservationOpen', () => {
    // getTodayStr is mocked to '20250904'; isAfterOrEqualDate uses the real implementation.
    it('is open for a non-terminal state with a future end date', () => {
      reservation.state = 'active';
      reservation.endDate = '20251231';
      expect(isReservationOpen(reservation)).toBe(true);
    });

    it('is open for an open-ended reservation (end sentinel 99991231)', () => {
      reservation.state = 'initial';
      reservation.endDate = '99991231';
      expect(isReservationOpen(reservation)).toBe(true);
    });

    it('is open when the end date is today', () => {
      reservation.state = 'applied';
      reservation.endDate = '20250904';
      expect(isReservationOpen(reservation)).toBe(true);
    });

    it('is not open when the reservation has already ended (past end date)', () => {
      reservation.state = 'active';
      reservation.endDate = '20250101';
      expect(isReservationOpen(reservation)).toBe(false);
    });

    it('is not open in a terminal state (cancelled/completed/denied), even with a future end date', () => {
      reservation.endDate = '20251231';
      for (const state of ['cancelled', 'completed', 'denied']) {
        reservation.state = state;
        expect(isReservationOpen(reservation)).toBe(false);
      }
    });
  });

  describe('Search Index functions', () => {
    it('getReservationIndex should return a formatted index string', () => {
      const index = getReservationIndex(reservation);
      expect(index).toBe('rn:John Doe rk:person-1 resn:Boat A resk:resource-1');
    });

    it('getReservationIndexInfo should return the info string', () => {
      expect(getReservationIndexInfo()).toBe('rn:reserverName rk:reserverKey resn:resourceName resk:resourceKey ');
    });
  });
});
