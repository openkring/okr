import { DeepRequired } from 'ngx-vest-forms';

import { AvatarInfo, Importance, Priority, TaskState } from '@bk2/shared-models';

export type TaskFormModel = {
  bkey: string,
  name: string,
  tags: string,
  notes: string,

  author: AvatarInfo | undefined;
  assignee: AvatarInfo | undefined;

  state: TaskState,
  dueDate: string,
  completionDate: string,
  priority: Priority,
  importance: Importance,

  scope: AvatarInfo | undefined;
  calendars: string[];
};

export const taskFormModelShape: DeepRequired<TaskFormModel> = {
  bkey: '',
  name: '',
  tags: '',
  notes: '',

  author: undefined,
  assignee: undefined,

  state: TaskState.Initial,
  dueDate: '',
  completionDate: '',
  priority: Priority.Medium,
  importance: Importance.Medium,

  scope: undefined,
  calendars: []
};
