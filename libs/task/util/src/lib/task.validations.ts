import { only, staticSuite} from 'vest';

import { DESCRIPTION_LENGTH } from '@bk2/shared/constants';
import { Importance, Priority, TaskModel, TaskState } from '@bk2/shared/models';
import { avatarInfoValidations, baseValidations, categoryValidations, dateValidations, stringValidations } from '@bk2/shared/util-core';

export const taskValidations = staticSuite((model: TaskModel, field?: string) => {
  if (field) only(field);

  baseValidations(model, field);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  avatarInfoValidations('author', model.author);
  avatarInfoValidations('assignee', model.assignee);

  categoryValidations('state', model.state, TaskState);
  dateValidations('dueDate', model.dueDate);  // may be empty
  dateValidations('completionDate', model.completionDate); // may be empty
  categoryValidations('priority', model.priority, Priority);
  categoryValidations('importance', model.importance, Importance);

  avatarInfoValidations('scope', model.scope);
  // calendars are not validated here
});

