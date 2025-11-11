import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { booleanValidations, stringValidations } from '@bk2/shared-util-core';

import { GroupNewFormModel } from './group-new-form.model';


export const groupNewFormValidations = staticSuite((model: GroupNewFormModel, field?: string) => {
  if (field) only(field);

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
  stringValidations('parentModelType', model.parentModelType, WORD_LENGTH);
});


