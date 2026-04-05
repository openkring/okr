import { only, staticSuite } from 'vest';

import { WORD_LENGTH } from '@bk2/shared-constants';
import { ActivityModel } from '@bk2/shared-models';
import { avatarValidations, dateTimeValidations, stringValidations } from '@bk2/shared-util-core';

export const activityValidations = staticSuite((model: ActivityModel, tenants: string, field?: string) => {
  if (field) only(field);

  dateTimeValidations('timestamp', model.timestamp);
  stringValidations('scope', model.scope, WORD_LENGTH);
  stringValidations('action', model.action, WORD_LENGTH);
  stringValidations('roleNeeded', model.roleNeeded, WORD_LENGTH);
  stringValidations('payload', model.payload, 500);
  avatarValidations('author', model.author);
});
