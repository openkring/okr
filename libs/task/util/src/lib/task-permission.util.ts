import { TaskModel, UserModel } from '@okr/shared-models';
import { hasRole } from '@okr/shared-util-core';

/*-------------------------- permissions --------------------------------*/
// One set of rules for every task surface — the list, the Kanban board and the dashboard
// section. `groupAdmin` is true when the surface is scoped to a group the current user
// administers (group view); group admins hold no tenant role, so it is passed in explicitly.

/** Any member may create a task (for themselves or someone else); group admins even without a tenant role. */
export function canCreateTask(currentUser: UserModel | undefined, groupAdmin = false): boolean {
  if (groupAdmin) return true;
  return hasRole('registered', currentUser);
}

/**
 * May the current user change this task? privileged/eventAdmin, the group admin of the scoped
 * group, and the task's own author or assignee.
 */
export function canChangeTask(task: TaskModel | undefined, currentUser: UserModel | undefined, groupAdmin = false): boolean {
  if (hasRole('privileged', currentUser)) return true;
  if (hasRole('eventAdmin', currentUser)) return true;
  if (groupAdmin) return true;
  return isOwnTask(task, currentUser, false);
}

/**
 * May the current user delete (archive) this task? privileged, the group admin of the scoped
 * group, and the task's author. The assignee may not — a task handed to you is not yours to drop.
 */
export function canDeleteTask(task: TaskModel | undefined, currentUser: UserModel | undefined, groupAdmin = false): boolean {
  if (hasRole('privileged', currentUser)) return true;
  if (groupAdmin) return true;
  return isOwnTask(task, currentUser, true);
}

/** Is the current user the task's author (or, unless authorOnly, its assignee)? Compared by personKey. */
function isOwnTask(task: TaskModel | undefined, currentUser: UserModel | undefined, authorOnly: boolean): boolean {
  const personKey = currentUser?.personKey;
  if (!task || !personKey) return false;
  if (task.author?.key === personKey) return true;
  return !authorOnly && task.assignee?.key === personKey;
}

/*-------------------------- completion --------------------------------*/
/**
 * The fields a completion toggle writes. Keeps the invariant state === 'done' <=> completionDate
 * is set: an open task becomes done today, a completed one goes back to planned.
 */
export function getCompletionPatch(task: TaskModel, today: string): Pick<TaskModel, 'state' | 'completionDate'> {
  return isTaskCompleted(task)
    ? { state: 'planned', completionDate: '' }
    : { state: 'done', completionDate: today };
}

/** A task is completed when its completionDate is set (legacy docs may lack the field). */
export function isTaskCompleted(task: TaskModel): boolean {
  return (task.completionDate ?? '').length > 0;
}
