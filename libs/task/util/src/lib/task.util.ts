import { AvatarInfo, Importance, Priority, TaskModel, TaskState } from '@bk2/shared-models';
import { isType } from '@bk2/shared-util-core';

import { TaskFormModel } from './task-form.model';

export function newTaskFormModel(author?: AvatarInfo, assignee?: AvatarInfo): TaskFormModel {
  return {
    bkey: '',
    name: '',
    tags: '',
    notes: '',

    author: author,
    assignee: assignee,

    state: TaskState.Initial,
    dueDate: '',
    completionDate: '',
    priority: Priority.Medium,
    importance: Importance.Medium,

    scope: undefined,
    calendars: [],
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

export function convertFormToTask(task: TaskModel | undefined, vm: TaskFormModel, tenantId: string): TaskModel {
  task ??= new TaskModel(tenantId);
  task.name = vm.name ?? '';
  task.notes = vm.notes ?? '';
  task.tags = vm.tags ?? '';

  task.author = vm.author;
  task.assignee = vm.assignee;

  task.state = vm.state ?? TaskState.Initial;
  task.dueDate = vm.dueDate ?? '';
  task.completionDate = vm.completionDate ?? '';
  task.priority = vm.priority ?? Priority.Medium;
  task.importance = vm.importance ?? Importance.Medium;

  task.scope = vm.scope;
  task.calendars = vm.calendars ?? [];
  return task;
}

export function isTask(task: unknown, tenantId: string): task is TaskModel {
  return isType(task, new TaskModel(tenantId));
}
