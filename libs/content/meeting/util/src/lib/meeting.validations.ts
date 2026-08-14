import { only, staticSuite } from 'vest';

import { LONG_NAME_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { MeetingModel } from '@okr/shared-models';
import { avatarValidations, baseValidations, dateValidations, stringValidations, stringsValidations, timeValidations } from '@okr/shared-util-core';

export const MEETING_STATES = ['draft', 'invited', 'held', 'approved'];

export const meetingValidations = staticSuite((model: MeetingModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('name', model.name, LONG_NAME_LENGTH, 1, true);
  stringValidations('groupKey', model.groupKey, SHORT_NAME_LENGTH);
  stringValidations('locationKey', model.locationKey, LONG_NAME_LENGTH);
  stringsValidations('state', model.state, MEETING_STATES);
  dateValidations('meetingDate', model.meetingDate);
  timeValidations('startTime', model.startTime);
  avatarValidations('chair', model.chair);
  avatarValidations('secretary', model.secretary);
});
