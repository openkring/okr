import { BkModel, NamedModel, SearchableModel, TaggedModel } from './base.model';
import { AccountType } from './enums/account-type.enum';
import { DocumentType } from './enums/document-type.enum';
import { GenderType } from './enums/gender-type.enum';
import { ModelType } from './enums/model-type.enum';
import { OrgType } from './enums/org-type.enum';
import { Periodicity } from './enums/periodicity.enum';
import { ReservationReason } from './enums/reservation-reason.enum';
import { ReservationState } from './enums/reservation-state.enum';
import { ResourceType } from './enums/resource-type.enum';

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
  public bkey = '';
  public tenants: string[] = [];
  public isArchived = false;
  public index = '';
  public tags = '';
  public name = '';
  public notes = '';

  // the person or org making the reservation
  public reserverKey = '';
  public reserverName = ''; // e.g. firstname of subject
  public reserverName2 = ''; // name of subject, e.g. lastname
  public reserverModelType: ModelType = ModelType.Person; // Person or Org
  public reserverType?: GenderType | OrgType; // gender for Person or orgType for Org

  // the resource that the reservation is for
  public resourceKey = '';
  public resourceName = ''; // name of object, e.g. lastname
  public resourceModelType: ModelType = ModelType.Resource; // Resource or Account
  public resourceType: ResourceType | AccountType = ResourceType.RowingBoat; // e.g. Locker, Boat, Room, Document
  public resourceSubType?: GenderType | DocumentType; // e.g. gender for Lockers or License, DocumentType for Documents or contracts

  public startDate = '';
  public startTime = '';
  public endDate = '';
  public endTime = '';
  public numberOfParticipants = '';
  public area = '';
  public reservationRef = ''; // e.g. the reservation number or contact person
  public reservationState?: ReservationState;
  public reservationReason?: ReservationReason;
  public priority?: number; // e.g. relevant for waiting list (state applied)

  public price = 0;
  public currency = 'CHF';
  public periodicity = Periodicity.Once;

  constructor(tenantId: string) {
    this.tenants = [tenantId];
  }
}

export const ReservationCollection = 'reservations';
