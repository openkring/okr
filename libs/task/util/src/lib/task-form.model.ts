import { AvatarInfo } from '@bk2/shared-models';
import { DEFAULT_CALENDARS, DEFAULT_DATE, DEFAULT_IMPORTANCE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRIORITY, DEFAULT_TAGS, DEFAULT_TASK_STATE } from '@bk2/shared-constants';

export type TaskFormModel = {
  bkey: string,
  name: string,
  tags: string,
  notes: string,

  author: AvatarInfo | undefined;
  assignee: AvatarInfo | undefined;

  state: string,
  dueDate: string,
  completionDate: string,
  priority: string,
  importance: string,

  scope: AvatarInfo | undefined;
  calendars: string[];
};

export const TASK_FORM_SHAPE: TaskFormModel = {
  bkey: DEFAULT_KEY,
  name: DEFAULT_NAME,
  tags: DEFAULT_TAGS,
  notes: DEFAULT_NOTES,

  author: undefined,
  assignee: undefined,

  state: DEFAULT_TASK_STATE,
  dueDate: DEFAULT_DATE,
  completionDate: DEFAULT_DATE,
  priority: DEFAULT_PRIORITY,
  importance: DEFAULT_IMPORTANCE,

  scope: undefined,
  calendars: DEFAULT_CALENDARS
};
