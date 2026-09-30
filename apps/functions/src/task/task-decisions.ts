// apps/functions/src/task/task-decisions.ts
export type TaskDocLike = {
  name?: string; state?: string; isArchived?: boolean; completionDate?: string; dueDate?: string;
  assignee?: { key?: string }; author?: { key?: string }; tenants?: string[];
};

/** Where every task push deep-links to — the member's own list with the task context menu. */
export const TASK_LIST_URL = '/task/my/c-tasks';

/**
 * Should the assignee get a push? On create, re-assignment or re-open — never for a done,
 * archived or unassigned task, and never when the assignee is the author (spec 1.72 §7.1).
 */
export function decideTaskPush(before: TaskDocLike | undefined, after: TaskDocLike | undefined): boolean {
  if (!after) return false;
  const assignee = after.assignee?.key ?? '';
  if (!assignee || after.isArchived || (after.completionDate ?? '') !== '' || after.state === 'done') return false;
  if (assignee === (after.author?.key ?? '')) return false;
  if (!before) return true;
  const reassigned = (before.assignee?.key ?? '') !== assignee;
  const reopened = (before.completionDate ?? '') !== '' && (after.completionDate ?? '') === '';
  return reassigned || reopened;
}
