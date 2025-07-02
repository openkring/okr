import { END_FUTURE_DATE_STR } from "@bk2/shared/constants";
import { AccountType, DocumentType, GenderType, ModelType, OrgType, Periodicity, ReservationReason, ReservationState, ResourceType } from "@bk2/shared/models";
import { getTodayStr } from "@bk2/shared/util-core";
import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

export type ReservationFormModel = DeepPartial<{
  bkey: string,
  tags: string,
  notes: string
  name: string; 

  reserverKey: string,      // bkey
  reserverName: string,    // firstName
  reserverName2: string,    // lastName
  reserverModelType: ModelType,   // Person or Org
  reserverType: GenderType | OrgType,

  resourceKey: string,
  resourceName: string,    // firstName
  resourceModelType: ModelType,     // Resource or Account
  resourceType: ResourceType | AccountType,
  resourceSubType: GenderType | DocumentType,

  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  numberOfParticipants: string,
  area: string,
  reservationRef: string,
  reservationState: ReservationState,
  reservationReason: ReservationReason,
  priority: number,

  price: number,
  currency: string,
  periodicity: Periodicity
}>;

export const reservationFormModelShape: DeepRequired<ReservationFormModel> = {
  bkey: '',
  tags: '',
  notes: '',
  name: '',

  reserverKey: '',
  reserverName: '',
  reserverName2: '',
  reserverModelType: ModelType.Person,
  reserverType: GenderType.Male,

  resourceKey: '',
  resourceName: '',
  resourceModelType: ModelType.Resource,
  resourceType: ResourceType.RowingBoat,
  resourceSubType: GenderType.Male,

  startDate: getTodayStr(),
  startTime: '',
  endDate: END_FUTURE_DATE_STR,
  endTime: '',
  numberOfParticipants: '',
  area: '',
  reservationRef: '',
  reservationState: ReservationState.Active,
  reservationReason: ReservationReason.SocialEvent,
  priority: 0,

  price: 0,
  currency: 'CHF',
  periodicity: Periodicity.Once
};