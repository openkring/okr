import { AvatarInfo, TaskModel } from '@bk2/shared-models';
import { addIndexElement, die, isType } from '@bk2/shared-util-core';

import { TaskFormModel } from './task-form.model';
import { DEFAULT_CALENDARS, DEFAULT_DATE, DEFAULT_IMPORTANCE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PRIORITY, DEFAULT_TAGS, DEFAULT_TASK_STATE } from '@bk2/shared-constants';

export function newTaskFormModel(author?: AvatarInfo, assignee?: AvatarInfo): TaskFormModel {
  return {
    bkey: DEFAULT_KEY,
    name: DEFAULT_NAME,
    tags: DEFAULT_TAGS,
    notes: DEFAULT_NOTES,

    author: author,
    assignee: assignee,

    state: DEFAULT_TASK_STATE,
    dueDate: DEFAULT_DATE,
    completionDate: DEFAULT_DATE,
    priority: DEFAULT_PRIORITY,
    importance: DEFAULT_IMPORTANCE,

    scope: undefined,
    calendars: DEFAULT_CALENDARS,
  };
}

export function convertTaskToForm(task: TaskModel): TaskFormModel {
  return {
    bkey: task.bkey,
    name: task.name,
    notes: task.notes,
    tags: task.tags,

    author: task.author,
    assignee: task.assignee,

    state: task.state,
    dueDate: task.dueDate,
    completionDate: task.completionDate,
    priority: task.priority,
    importance: task.importance,

    scope: task.scope,
    calendars: task.calendars,
  };
}

export function convertFormToTask(vm?: TaskFormModel, task?: TaskModel): TaskModel {
  if (!task) die('task.util.convertFormToTask: task is mandatory.');
  if (!vm) return task;
  
  task.name = vm.name ?? DEFAULT_NAME;
  task.notes = vm.notes ?? DEFAULT_NOTES;
  task.tags = vm.tags ?? DEFAULT_TAGS;

  task.author = vm.author;
  task.assignee = vm.assignee;

  task.state = vm.state ?? DEFAULT_TASK_STATE;
  task.dueDate = vm.dueDate ?? DEFAULT_DATE;
  task.completionDate = vm.completionDate ?? DEFAULT_DATE;
  task.priority = vm.priority ?? DEFAULT_PRIORITY;
  task.importance = vm.importance ?? DEFAULT_IMPORTANCE;

  task.scope = vm.scope;
  task.calendars = vm.calendars ?? DEFAULT_CALENDARS;
  return task;
}

export function isTask(task: unknown, tenantId: string): task is TaskModel {
  return isType(task, new TaskModel(tenantId));
}

/*-------------------------- search index --------------------------------*/
/**
 * Create an index entry for a given task based on its values.
 * @param task 
 * @returns the index string
 */
export function getTaskIndex(task: TaskModel): string {
  let index = '';
  index = addIndexElement(index, 'n', task.name);
  if (task.author) {
    index = addIndexElement(index, 'an', task.author.name1 + ' ' + task.author.name2);
    index = addIndexElement(index, 'ak', task.author.key);
  }
  if (task.assignee) {
    index = addIndexElement(index, 'asn', task.assignee.name1 + ' ' + task.assignee.name2);
    index = addIndexElement(index, 'ask', task.assignee.key);
  }
  return index;
}

/**
 * Returns a string explaining the structure of the index.
 * This can be used in info boxes on the GUI.
 */
export function getTaskIndexInfo(): string {
  return 'n:name, an:authorname, ak:authorKey, asn:assigneeName, ask:assigneeKey';
}
