import { only, staticSuite } from 'vest';

import { DESCRIPTION_LENGTH } from '@okr/shared-constants';
import { TaskModel } from '@okr/shared-models';
import { avatarValidations, baseValidations, dateValidations, stringValidations } from '@okr/shared-util-core';

export const taskValidations = staticSuite((model: TaskModel, tenants: string, tags: string, field?: string) => {
  if (field) only(field);

  baseValidations(model, tenants, tags, field);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  avatarValidations('author', model.author);
  avatarValidations('assignee', model.assignee);

  stringValidations('state', model.state);
  dateValidations('dueDate', model.dueDate);  // may be empty
  dateValidations('completionDate', model.completionDate); // may be empty
  stringValidations('priority', model.priority);
  stringValidations('importance', model.importance);

  // calendars are not validated here
});

