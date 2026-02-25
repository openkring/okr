
import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { booleanValidations, numberValidations, stringValidations } from '@bk2/shared-util-core';
import { MatrixRoom } from '@bk2/shared-models';

export const roomValidations = staticSuite((model: MatrixRoom, field?: string) => {
  if (field) only(field);

  stringValidations('roomId', model.roomId, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH, 4, true);
  stringValidations('avatar', model.avatar, SHORT_NAME_LENGTH);
  stringValidations('topic', model.topic, DESCRIPTION_LENGTH);
  booleanValidations('isDirect', model.isDirect);
  numberValidations('unreadCount', model.unreadCount, true, 0);
  // lastMessage
  // members - tbd: validate array of objects with userId, displayName, avatarUrl, membership
  // typingUsers - tbd: validate array of strings (userIds)
  // stringValidations('visibility', model.visibility, SHORT_NAME_LENGTH, 4, true); // tbd: check value for being public or private
  // tbd: check value for being public or private
});
