import { only, staticSuite } from 'vest';

import { WORD_LENGTH } from '@okr/shared-constants';
import { ActivityModel } from '@okr/shared-models';
import { avatarValidations, dateTimeValidations, stringValidations } from '@okr/shared-util-core';

export const activityValidations = staticSuite((model: ActivityModel, tenants: string, field?: string) => {
  if (field) only(field);

  dateTimeValidations('timestamp', model.timestamp);
  stringValidations('scope', model.scope, WORD_LENGTH);
  stringValidations('action', model.action);
  stringValidations('roleNeeded', model.roleNeeded);
  stringValidations('payload', model.payload, 500);
  avatarValidations('author', model.author);
});
