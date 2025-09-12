import { describe, it, expect, vi, beforeEach } from 'vitest';
import { END_FUTURE_DATE_STR } from '@bk2/shared-constants';
import { GenderType, ModelType, OrgModel, Periodicity, PersonModel, ReservationModel, ReservationReason, ReservationState, ResourceModel, ResourceType, RowingBoatType, UserModel } from '@bk2/shared-models';
import * as coreUtils from '@bk2/shared-util-core';

import { newReservationFormModel, convertReservationToForm, convertFormToReservation, convertReserverAndResourceToNewForm, convertFormToNewReservation, getReserverName, isReservation, getReservationSearchIndex, getReservationSearchIndexInfo } from './reservation.util';
import { ReservationFormModel } from './reservation-form.model';

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
  const mockGetTodayStr = vi.mocked(coreUtils.getTodayStr);

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
    reservation.reserverKey = 'person-1';
    reservation.reserverName = 'John';
    reservation.reserverName2 = 'Doe';
    reservation.reserverModelType = ModelType.Person;
    reservation.resourceKey = 'resource-1';
    reservation.resourceName = 'Boat A';
    reservation.startDate = '20251010';

    person = new PersonModel(tenantId);
    person.bkey = 'person-1';
    person.firstName = 'Jane';
    person.lastName = 'Doe';
    person.gender = GenderType.Female;

    org = new OrgModel(tenantId);
    org.bkey = 'org-1';
    org.name = 'Rowing Club';

    resource = new ResourceModel(tenantId);
    resource.bkey = 'resource-1';
    resource.name = 'Single Scull';
    resource.type = ResourceType.RowingBoat;
    resource.subType = RowingBoatType.b1x;

    currentUser = new UserModel(tenantId);
    currentUser.bkey = 'user-1';
  });

  describe('newReservationFormModel', () => {
    it('should return a default form model', () => {
      const formModel = newReservationFormModel();
      expect(formModel.bkey).toBe('');
      expect(formModel.startDate).toBe('20250904');
      expect(formModel.endDate).toBe(END_FUTURE_DATE_STR);
      expect(formModel.reservationState).toBe(ReservationState.Active);
    });
  });

  describe('convertReservationToForm', () => {
    it('should convert a ReservationModel to a form model', () => {
      const formModel = convertReservationToForm(reservation);
      expect(formModel.bkey).toBe('res-1');
      expect(formModel.name).toBe('Team Training');
      expect(formModel.reserverKey).toBe('person-1');
    });

    it('should return a new form model if reservation is undefined', () => {
      const formModel = convertReservationToForm(undefined);
      expect(formModel.bkey).toBe('');
      expect(formModel.startDate).toBe('20250904');
    });
  });

  describe('convertFormToReservation', () => {
    const formModel: ReservationFormModel = {
      name: 'New Event',
      startDate: '20260101',
      reservationState: ReservationState.Cancelled,
    } as ReservationFormModel;

    it('should update an existing reservation model', () => {
      const updated = convertFormToReservation(reservation, formModel, tenantId);
      expect(updated.name).toBe('New Event');
      expect(updated.startDate).toBe('20260101');
      expect(updated.reservationState).toBe(ReservationState.Cancelled);
    });

    it('should create a new reservation model if one is not provided', () => {
      const created = convertFormToReservation(undefined, formModel, tenantId);
      expect(created).toBeInstanceOf(ReservationModel);
      expect(created.name).toBe('New Event');
    });
  });

  describe('convertReserverAndResourceToNewForm', () => {
    it('should create a new form for a Person reserver', () => {
      const form = convertReserverAndResourceToNewForm(person, resource, currentUser, ModelType.Person);
      expect(form.reserverKey).toBe('person-1');
      expect(form.reserverName).toBe('Jane');
      expect(form.reserverName2).toBe('Doe');
      expect(form.reserverModelType).toBe(ModelType.Person);
      expect(form.resourceKey).toBe('resource-1');
    });

    it('should create a new form for an Org reserver', () => {
      const form = convertReserverAndResourceToNewForm(org, resource, currentUser, ModelType.Org);
      expect(form.reserverKey).toBe('org-1');
      expect(form.reserverName2).toBe('Rowing Club');
      expect(form.reserverModelType).toBe(ModelType.Org);
    });

    it('should call die if currentUser or modelType are missing', () => {
      convertReserverAndResourceToNewForm(person, resource, undefined, ModelType.Person);
      expect(mockDie).toHaveBeenCalledWith('reservation.util.convertReserverAndResourceToNewForm: currentUser is mandatory');

      convertReserverAndResourceToNewForm(person, resource, currentUser, undefined);
      expect(mockDie).toHaveBeenCalledWith('reservation.util.convertReserverAndResourceToNewForm: modelType is mandatory');
    });
  });

  describe('convertFormToNewReservation', () => {
    it('should create a new ReservationModel from a form model', () => {
      const formModel: ReservationFormModel = {
        name: 'New Reservation',
        reserverKey: 'person-1',
        resourceKey: 'resource-1',
      } as ReservationFormModel;
      const newReservation = convertFormToNewReservation(formModel, tenantId);
      expect(newReservation).toBeInstanceOf(ReservationModel);
      expect(newReservation.name).toBe('New Reservation');
      expect(newReservation.isArchived).toBe(false);
    });
  });

  describe('getReserverName', () => {
    it('should return "firstName lastName" for a person', () => {
      reservation.reserverModelType = ModelType.Person;
      reservation.reserverName = 'John';
      reservation.reserverName2 = 'Doe';
      expect(getReserverName(reservation)).toBe('John Doe');
    });

    it('should return "name" for an org', () => {
      reservation.reserverModelType = ModelType.Org;
      reservation.reserverName2 = 'The Big Club';
      expect(getReserverName(reservation)).toBe('The Big Club');
    });
  });

  describe('isReservation', () => {
    it('should call isType with the correct parameters', () => {
      isReservation({}, tenantId);
      expect(mockIsType).toHaveBeenCalledWith({}, expect.any(ReservationModel));
    });
  });

  describe('Search Index functions', () => {
    it('getReservationSearchIndex should return a formatted index string', () => {
      const index = getReservationSearchIndex(reservation);
      expect(index).toBe('rn:John Doe rk:person-1 resn:Boat A resk:resource-1');
    });

    it('getReservationSearchIndexInfo should return the info string', () => {
      expect(getReservationSearchIndexInfo()).toBe('rn:reserverName rk:reserverKey resn:resourceName resk:resourceKey ');
    });
  });
});
