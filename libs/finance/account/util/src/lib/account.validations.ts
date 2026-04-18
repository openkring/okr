import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { AccountModel } from '@bk2/shared-models';
import { baseValidations, stringValidations } from '@bk2/shared-util-core';

export const accountValidations = staticSuite((model: AccountModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);  // bkey, tenants, isArchived
  stringValidations('name', model.name, SHORT_NAME_LENGTH, 1, true);
  stringValidations('id', model.id, SHORT_NAME_LENGTH);
  stringValidations('type', model.type, WORD_LENGTH, 1, true);
  stringValidations('label', model.label, SHORT_NAME_LENGTH);
  stringValidations('parentId', model.parentId, SHORT_NAME_LENGTH);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);
});
