import { only, staticSuite} from 'vest';
import { booleanValidations, categoryValidations, stringValidations } from '@bk2/shared/util-core';
import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared/constants';
import { GroupFormModel } from './group-form.model';
import { ModelType } from '@bk2/shared/models';


export const groupFormValidations = staticSuite((model: GroupFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH, 3, true);
  stringValidations('id', model.id, WORD_LENGTH, 3, true);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  //tagValidations('tags', model.tags);

  booleanValidations('hasContent', model.hasContent);
  booleanValidations('hasChat', model.hasChat);
  booleanValidations('hasCalendar', model.hasCalendar);
  booleanValidations('hasTasks', model.hasTasks);
  booleanValidations('hasFiles', model.hasFiles);
  booleanValidations('hasAlbum', model.hasAlbum);
  booleanValidations('hasMembers', model.hasMembers);
  stringValidations('parentKey', model.parentKey, SHORT_NAME_LENGTH);
  stringValidations('parentName', model.parentName, SHORT_NAME_LENGTH);
  categoryValidations('parentModelType', model.parentModelType, ModelType);
});


