import { DEFAULT_DATE, DEFAULT_INDEX, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_RES_REASON, DEFAULT_RES_STATE, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TIME } from '@bk2/shared-constants';
import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { AvatarInfo } from './avatar-info';
import { MoneyModel } from './money.model';

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
 * 
 * Each Resource may have multiple Reservations. As soon as the first reservation for a resource is created,
 * a resource calendar is opened with key 'resource.{resourceKey}'. This calendar is public and contains all reservations
 * for the resource.
 * CalEvents of a resource can not be changed directly, they are created/updated/deleted via Reservations.
 * That's because the startDate and endDate need to be kept in sync between Reservation and CalEvent.
 */
export class ReservationModel implements BkModel, NamedModel, SearchableModel, TaggedModel {
  // base
  public bkey = DEFAULT_KEY;
  public tenants = DEFAULT_TENANTS;
  public isArchived = false;
  public index = DEFAULT_INDEX;
  public tags = DEFAULT_TAGS;
  public name = DEFAULT_NAME;
  public notes = DEFAULT_NOTES;   // internal notes

  // the person or org making the reservation
  public reserver: AvatarInfo | undefined; // avatar for person or org

  // the resource that the reservation is for
  public resource: AvatarInfo | undefined; // avatar for resource or account

  // event details
  public startDate = DEFAULT_DATE;
  public startTime = DEFAULT_TIME; // start time of the reservation
  public fullDay = false; // whether the reservation is a full-day event (affects durationMinutes and which fields are shown)
  public durationMinutes = 60; // duration of the event in minutes, 60, 120, 1440 = full day
  public endDate = DEFAULT_DATE;
  // repeating reservations are not supported for now

  public participants = '';
  public area = '';
  public ref = ''; // e.g. the reservation number or contact person
  public state = DEFAULT_RES_STATE;
  public reason = DEFAULT_RES_REASON;
  public order = DEFAULT_ORDER; // e.g. relevant for waiting list (state applied)
  public description = '';  // public notes
  public price: MoneyModel | undefined;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ReservationCollection = 'reservations';
export const ReservationModelName = 'reservation';
