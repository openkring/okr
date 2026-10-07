import { staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { FolderModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

export const folderValidations = staticSuite((model: FolderModel, tenants: string, tags: string) => {

  baseValidations(model, tenants, tags);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  stringValidations('description', model.description, DESCRIPTION_LENGTH);
  stringValidations('title', model.title, SHORT_NAME_LENGTH);
});
