import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarModelTypes, OrgModel, PersonModel, ReservationModel, ResourceModel, UserModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { getReservationIndex, getReservationIndexInfo, isReservation } from './reservation.util';

// Mock shared utility functions
vi.mock('@bk2/shared-util-core', async importOriginal => {
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
vi.mock('@bk2/shared-i18n', () => ({
  bkTranslate: vi.fn(),
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
    reservation.bkey = 'res-1';
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
    person.bkey = 'person-1';
    person.firstName = 'Jane';
    person.lastName = 'Doe';
    person.gender = 'female';

    org = new OrgModel(tenantId);
    org.bkey = 'org-1';
    org.name = 'Rowing Club';

    resource = new ResourceModel(tenantId);
    resource.bkey = 'resource-1';
    resource.name = 'Single Scull';
    resource.type = 'rboat';
    resource.subType = 'b1x';

    currentUser = new UserModel(tenantId);
    currentUser.bkey = 'user-1';
  });

  describe('isReservation', () => {
    it('should call isType with the correct parameters', () => {
      isReservation({}, tenantId);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(ReservationModel));
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
