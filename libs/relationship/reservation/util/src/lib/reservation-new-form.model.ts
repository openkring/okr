import { DeepPartial, DeepRequired } from 'ngx-vest-forms';

import { DEFAULT_CURRENCY, DEFAULT_GENDER, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_ORDER, DEFAULT_PERIODICITY, DEFAULT_PRICE, DEFAULT_PRIORITY, DEFAULT_RBOAT_TYPE, DEFAULT_RES_REASON, DEFAULT_RES_STATE, DEFAULT_RESOURCE_TYPE, DEFAULT_TAGS, DEFAULT_TIME, END_FUTURE_DATE_STR } from "@bk2/shared-constants";
import { getTodayStr } from "@bk2/shared-util-core";

export type ReservationNewFormModel = DeepPartial<{
  tags: string,
  notes: string
  name: string; 

  reserverKey: string,      // bkey
  reserverName: string,    // firstName
  reserverName2: string,    // lastName
  reserverModelType: 'person' | 'org',
  reserverType: string,

  resourceKey: string,
  resourceName: string,    // firstName
  resourceModelType: 'resource' | 'account',
  resourceType: string,
  resourceSubType: string,

  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  numberOfParticipants: string,
  area: string,
  reservationRef: string,
  reservationState: string,
  reservationReason: string,
  order: number,

  price: number,
  currency: string,
  periodicity: string
}>;

export const reservationNewFormModelShape: DeepRequired<ReservationNewFormModel> = {
  tags: DEFAULT_TAGS,
  notes: DEFAULT_NOTES,
  name: DEFAULT_NAME,

  reserverKey: DEFAULT_KEY,
  reserverName: DEFAULT_NAME,
  reserverName2: DEFAULT_NAME,
  reserverModelType: 'person',
  reserverType: DEFAULT_GENDER,

  resourceKey: DEFAULT_KEY,
  resourceName: DEFAULT_NAME,
  resourceModelType: 'resource',
  resourceType: DEFAULT_RESOURCE_TYPE,
  resourceSubType: DEFAULT_RBOAT_TYPE,

  startDate: getTodayStr(),
  startTime: DEFAULT_TIME,
  endDate: END_FUTURE_DATE_STR,
  endTime: DEFAULT_TIME,
  numberOfParticipants: '',
  area: '',
  reservationRef: '',
  reservationState: DEFAULT_RES_STATE,
  reservationReason: DEFAULT_RES_REASON,
  order: DEFAULT_ORDER,

  price: DEFAULT_PRICE,
  currency: DEFAULT_CURRENCY,
  periodicity: DEFAULT_PERIODICITY
};