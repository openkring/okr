import { DEFAULT_CURRENCY, DEFAULT_DATE, DEFAULT_GENDER, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_PERIODICITY, DEFAULT_PRICE, DEFAULT_PRIORITY, DEFAULT_RBOAT_TYPE, DEFAULT_RES_REASON, DEFAULT_RES_STATE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TIME } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';

/**
 * A reservation of a resource or a rowing boat.
 *
 * Person|Org            reserves|isReservedBy      Resource|RowingBoat
 *
 * ReservationState: Reserved, Confirmed, Cancelled, NoShow, ...
 * ReservationType: Booking, Reservation, Registration (WaitingList/Application = RelationshipState.Applied)
 * ReservationReason: Course, Workshop, Meeting, Party, SocialEvent, Maintenance, SportsEvent, BusinessEvent, PrivateEvent, PublicEvent, StoragePlace, ClubEvent
 *
 * Examples:
 * - reservation of a rowing boat
 * - booking of a room
 * - registration for a course
 * - waiting list of applicants
 */
export class ReservationModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  // base
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public name = DEFAULT_NAME;
  public notes = DEFAULT_NOTES;

  // the person or org making the reservation
  public reserverKey = DEFAULT_KEY;
  public reserverName = DEFAULT_NAME; // e.g. firstname of subject
  public reserverName2 = DEFAULT_NAME; // name of subject, e.g. lastname
  public reserverModelType: 'person' | 'org' = 'person';
  public reserverType = DEFAULT_GENDER; // gender for Person or orgType for Org

  // the resource that the reservation is for
  public resourceKey = DEFAULT_KEY;
  public resourceName = DEFAULT_NAME; // name of object, e.g. lastname
  public resourceModelType: 'resource' | 'account' = 'resource';
  public resourceType = DEFAULT_RESOURCE_TYPE; // resource or account e.g. Locker, Boat, Room, Document
  public resourceSubType = DEFAULT_RBOAT_TYPE; // e.g. gender for Lockers or License, type for Documents or contracts

  public startDate = DEFAULT_DATE;
  public startTime = DEFAULT_TIME;
  public endDate = DEFAULT_DATE;
  public endTime = DEFAULT_TIME;
  public numberOfParticipants = '';
  public area = '';
  public reservationRef = ''; // e.g. the reservation number or contact person
  public reservationState = DEFAULT_RES_STATE;
  public reservationReason = DEFAULT_RES_REASON;
  public order = DEFAULT_ORDER; // e.g. relevant for waiting list (state applied)

  public price = DEFAULT_PRICE;
  public currency = DEFAULT_CURRENCY;
  public periodicity = DEFAULT_PERIODICITY;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ReservationCollection = 'reservations';
export const ReservationModelName = 'reservation';
