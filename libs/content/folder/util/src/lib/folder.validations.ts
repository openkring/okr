import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { FolderModel } from '@okr/shared-models';
import { baseValidations, stringValidations } from '@okr/shared-util-core';

export const folderValidations = staticSuite((model: FolderModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  stringValidations('description', model.description, SHORT_NAME_LENGTH);
  stringValidations('title', model.title, SHORT_NAME_LENGTH);
});
