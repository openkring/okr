import { only, staticSuite} from 'vest';
import { categoryValidations, dateValidations, stringValidations } from '@bk2/shared/util';
import { DESCRIPTION_LENGTH, SHORT_NAME_LENGTH } from '@bk2/shared/config';
import { TaskFormModel } from './task-form.model';
import { avatarInfoValidations } from '@bk2/shared/data-access';
import { Importance, Priority, TaskState } from '@bk2/shared/models';


export const taskFormValidations = staticSuite((model: TaskFormModel, field?: string) => {
  if (field) only(field);

  stringValidations('bkey', model.bkey, SHORT_NAME_LENGTH);
  stringValidations('name', model.name, SHORT_NAME_LENGTH);
  //tagValidations('tags', model.tags);
  stringValidations('notes', model.notes, DESCRIPTION_LENGTH);

  avatarInfoValidations('author', model.author);
  avatarInfoValidations('assignee', model.assignee);

  categoryValidations('state', model.state, TaskState);
  dateValidations('dueDate', model.dueDate);  // may be empty
  dateValidations('completionDate', model.completionDate); // may be empty
  categoryValidations('priority', model.priority, Priority);
  categoryValidations('importance', model.importance, Importance);

  avatarInfoValidations('scope', model.scope);
  // calendars is not validated, as it is a list of strings
});

