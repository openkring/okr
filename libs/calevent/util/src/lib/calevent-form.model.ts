import { AvatarInfo } from '@bk2/shared-models';
import { DEFAULT_CALENDARS, DEFAULT_CALEVENT_TYPE, DEFAULT_DATE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PERIODICITY, DEFAULT_TAGS, DEFAULT_TENANTS, DEFAULT_TIME, DEFAULT_URL } from '@bk2/shared-constants';

export type CalEventFormModel = {
  bkey: string,
  tenants: string[],
  name: string,
  type: string,
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  locationKey: string,
  periodicity: string,
  repeatUntilDate: string,
  calendars: string[],
  responsiblePersons: AvatarInfo[],
  url: string,
  description: string,
  tags: string,
};

export const CAL_EVENT_FORM_SHAPE: CalEventFormModel = {
  bkey: DEFAULT_KEY,
  tenants: DEFAULT_TENANTS,
  name: DEFAULT_NAME,
  type: DEFAULT_CALEVENT_TYPE,
  startDate: DEFAULT_DATE,
  startTime: DEFAULT_TIME,
  endDate: DEFAULT_DATE,
  endTime: DEFAULT_TIME,
  locationKey: DEFAULT_KEY,
  periodicity: DEFAULT_PERIODICITY,
  repeatUntilDate: DEFAULT_DATE,
  calendars: DEFAULT_CALENDARS,
  responsiblePersons: [],
  url: DEFAULT_URL,
  description: DEFAULT_NOTES,
  tags: DEFAULT_TAGS
};
