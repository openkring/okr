import { staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { WhiteboardModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

export const whiteboardValidations = staticSuite((model: WhiteboardModel, tenants: string, tags: string) => {

  baseValidations(model, tenants, tags);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
});
