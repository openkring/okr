import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { avatarInfoValidations, dateValidations, stringValidations } from '@bk2/shared-util-core';

import { TaskFormModel } from './task-form.model';

export const taskFormValidations = staticSuite((model: TaskFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  avatarInfoValidations('author', model.author);
  avatarInfoValidations('assignee', model.assignee);

  stringValidations('state', model.state, WORD_LENGTH);
  dateValidations('dueDate', model.dueDate);  // may be empty
  dateValidations('completionDate', model.completionDate); // may be empty
  stringValidations('priority', model.priority, WORD_LENGTH);
  stringValidations('importance', model.importance, WORD_LENGTH);

  avatarInfoValidations('scope', model.scope);
  // calendars is not validated, as it is a list of strings
});

