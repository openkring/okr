import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AvatarModelTypes, OrgModel, PersonModel, ReservationModel, ResourceModel, UserModel } from '@okr/shared-models';
import { END_FUTURE_DATE_STR } from '@okr/shared-constants';
import * as coreUtils from '@okr/shared-util-core';

import { findActiveReservationForResource, getReservationIndex, getReservationIndexInfo, isReservation, isReservationActiveNow, isReservationOpen } from './reservation.util';

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

describe('isReservationActiveNow', () => {
  function make(partial: Partial<ReservationModel>): ReservationModel {
    return { ...new ReservationModel('scs'), ...partial } as ReservationModel;
  }

  it('is active when it started in the past and ends in the future', () => {
    const r = make({ state: 'active', startDate: '20200101', endDate: END_FUTURE_DATE_STR });
    expect(isReservationActiveNow(r, '20260903')).toBe(true);
  });

  it('is active on its first and last day', () => {
    const r = make({ state: 'active', startDate: '20260903', endDate: '20260903' });
    expect(isReservationActiveNow(r, '20260903')).toBe(true);
  });

  it('is not active before it starts', () => {
    const r = make({ state: 'active', startDate: '20261001', endDate: '20261005' });
    expect(isReservationActiveNow(r, '20260903')).toBe(false);
  });

  it('is not active after it ended', () => {
    const r = make({ state: 'active', startDate: '20260101', endDate: '20260201' });
    expect(isReservationActiveNow(r, '20260903')).toBe(false);
  });

  it('is not active in a terminal state', () => {
    const r = make({ state: 'cancelled', startDate: '20200101', endDate: END_FUTURE_DATE_STR });
    expect(isReservationActiveNow(r, '20260903')).toBe(false);
  });

  it('treats an empty startDate as already started', () => {
    const r = make({ state: 'active', startDate: '', endDate: END_FUTURE_DATE_STR });
    expect(isReservationActiveNow(r, '20260903')).toBe(true);
  });
});

describe('findActiveReservationForResource', () => {
  function make(partial: Partial<ReservationModel>): ReservationModel {
    return { ...new ReservationModel('scs'), ...partial } as ReservationModel;
  }

  const locked = make({
    okey: 'res1', state: 'active', startDate: '20200101', endDate: END_FUTURE_DATE_STR,
    reason: 'maintenance', notes: 'Riemen gebrochen',
    resource: { key: 'boat1', name1: '', name2: 'Gig 4x', modelType: 'resource', type: 'rboat', subType: 'b4x', label: '' },
  });
  const expired = make({
    okey: 'res2', state: 'active', startDate: '20260101', endDate: '20260201',
    resource: { key: 'boat2', name1: '', name2: 'Skiff', modelType: 'resource', type: 'rboat', subType: 'b1x', label: '' },
  });

  it('finds the active reservation of the given resource', () => {
    expect(findActiveReservationForResource([expired, locked], 'boat1', '20260903')?.okey).toBe('res1');
  });

  it('ignores reservations of other resources', () => {
    expect(findActiveReservationForResource([locked], 'boat9', '20260903')).toBeUndefined();
  });

  it('ignores reservations that are no longer active', () => {
    expect(findActiveReservationForResource([expired], 'boat2', '20260903')).toBeUndefined();
  });

  it('returns undefined without a resourceKey', () => {
    expect(findActiveReservationForResource([locked], '', '20260903')).toBeUndefined();
  });

  it('returns undefined for an empty list', () => {
    expect(findActiveReservationForResource([], 'boat1', '20260903')).toBeUndefined();
  });
});
