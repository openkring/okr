import { AvatarInfo, CalEventType, Periodicity } from '@bk2/shared/models';
import { DeepRequired } from 'ngx-vest-forms';

// a form model is always deep partial because angular will create it over time organically
export type CalEventFormModel = {
  bkey: string,
  tenants: string[],
  name: string,
  type: CalEventType,
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  locationKey: string,
  periodicity: Periodicity,
  repeatUntilDate: string,
  calendars: string[],
  responsiblePersons: AvatarInfo[],
  url: string,
  description: string,
  tags: string,
};

export const calEventFormModelShape: DeepRequired<CalEventFormModel> = {
  bkey: '',
  tenants: [],
  name: '',
  type: CalEventType.SocialEvent,
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  locationKey: '',
  periodicity: Periodicity.Once,
  repeatUntilDate: '',
  calendars: [],
  responsiblePersons: [],
  url: '',
  description: '',
  tags: ''
};