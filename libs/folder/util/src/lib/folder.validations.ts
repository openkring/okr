import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@bk2/shared-constants';
import { FolderModel } from '@bk2/shared-models';
import { baseValidations, stringValidations } from '@bk2/shared-util-core';

export const folderValidations = staticSuite((model: FolderModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  stringValidations('description', model.description, SHORT_NAME_LENGTH);
  stringValidations('title', model.title, SHORT_NAME_LENGTH);
});
