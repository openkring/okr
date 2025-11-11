import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH, WORD_LENGTH } from '@bk2/shared-constants';
import { TaskModel } from '@bk2/shared-models';
import { avatarInfoValidations, baseValidations, dateValidations, stringValidations } from '@bk2/shared-util-core';

export const taskValidations = staticSuite((model: TaskModel, field?: string) => {
  if (field) only(field);

  baseValidations(model, field);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  avatarInfoValidations('author', model.author);
  avatarInfoValidations('assignee', model.assignee);

  stringValidations('state', model.state, WORD_LENGTH);
  dateValidations('dueDate', model.dueDate);  // may be empty
  dateValidations('completionDate', model.completionDate); // may be empty
  stringValidations('priority', model.priority, WORD_LENGTH);
  stringValidations('importance', model.importance, WORD_LENGTH);

  avatarInfoValidations('scope', model.scope);
  // calendars are not validated here
});

