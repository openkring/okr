// apps/functions/src/task/task-decisions.ts
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

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

/** The validated maximum of `app-config.taskArchiveDays` (spec 1.72 §8.2: "validated 0 … 3650"). */
export const MAX_TASK_ARCHIVE_DAYS = 3650;

/**
 * `app-config/{tenantId}.taskArchiveDays` as read off Firestore, defensively — a legacy doc
 * predating this field, or one hand-edited to garbage, must not crash the daily job.
 * `0` means "never archive" and is kept; anything else invalid falls back to the model
 * default (30, see `AppConfigModel.taskArchiveDays`). Capped at `MAX_TASK_ARCHIVE_DAYS`: an
 * uncapped huge value would push `getArchiveCutoff`'s `Date` past the range `toISOString` can
 * render, throwing and skipping that tenant's whole run (archive AND due-today reminder).
 */
export function resolveTaskArchiveDays(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 30;
  return Math.min(Math.floor(raw), MAX_TASK_ARCHIVE_DAYS);
}

/**
 * The StoreDate `days` before `todayStoreDate` — the archive cut-off: a task whose
 * `completionDate` is strictly before this date is old enough to archive. `days === 0` means
 * "never archive" (see `resolveTaskArchiveDays`), signalled by the empty string so the caller
 * can skip the query entirely rather than special-case an unreachable date.
 *
 * Deliberately not `subDuration`/`addDuration` (see task-6 brief) — parses via
 * `convertDateFormatToString` to an ISO date, subtracts on a UTC `Date` (so DST never shifts
 * the calendar day), formats back to StoreDate.
 */
export function getArchiveCutoff(todayStoreDate: string, days: number): string {
  if (days === 0) return '';
  const iso = convertDateFormatToString(todayStoreDate, DateFormat.StoreDate, DateFormat.IsoDate);
  const cutoff = new Date(`${iso}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  return convertDateFormatToString(cutoff.toISOString().slice(0, 10), DateFormat.IsoDate, DateFormat.StoreDate);
}

/**
 * Does this write complete or reopen a task, for the purpose of syncing the assignee's diary
 * (spec 1.72 §9)? Mirrors the `completionDate` half of `decideTaskPush`'s reopen check, but
 * unlike the push decision this also fires on create-as-done and is indifferent to archiving,
 * self-assignment and re-assignment — the diary line only cares whether the task's done-ness
 * changed. Needs an assignee on the relevant side (`after` for complete, `before` for reopen);
 * a delete (`after` undefined) is never a transition.
 */
export function decideDiaryTransition(before: TaskDocLike | undefined, after: TaskDocLike | undefined): 'complete' | 'reopen' | 'none' {
  if (!after) return 'none';
  const beforeDone = (before?.completionDate ?? '') !== '';
  const afterDone = (after.completionDate ?? '') !== '';
  if (!beforeDone && afterDone) return after.assignee?.key ? 'complete' : 'none';
  if (beforeDone && !afterDone) return before?.assignee?.key ? 'reopen' : 'none';
  return 'none';
}

/** One where-clause of the open-task badge count. */
export type OpenTaskFilter = readonly [field: string, op: '==' | 'array-contains-any', value: unknown];

/**
 * The where-clauses of the badge's open-task count for one assignee. Keep in sync with
 * libs/shared/feature/src/lib/app.store.ts `openTasksResource` (via `getSystemQuery`): the app counts
 * the tenant's own tasks AND the shared `'system'` ones, so the server must too.
 */
export const openTaskCountFilters = (tenantId: string, assigneeKey: string): OpenTaskFilter[] => [
  ['isArchived', '==', false],
  ['tenants', 'array-contains-any', [tenantId, 'system']],
  ['completionDate', '==', ''],
  ['assignee.key', '==', assigneeKey],
];

/** Whether the open-task badge count (`openTaskCountFilters`) can include this task version. */
function countsAsOpen(doc: TaskDocLike | undefined): boolean {
  return !!doc && !!doc.assignee?.key && doc.isArchived !== true && (doc.completionDate ?? '') === '';
}

/**
 * The assignees whose open-task count this write can change (spec 1.127 §3.7 B1): the previous
 * and the new assignee whenever the task enters, leaves or moves within the count — create,
 * delete, complete, reopen, archive, re-assignment, a tenant change. Empty when the task is not
 * counted on either side or only an unrelated field changed (name, due date, notes). Errs on
 * recomputing: the count itself is queried, so an extra recompute is harmless.
 */
export function assigneesToRecompute(before: TaskDocLike | undefined, after: TaskDocLike | undefined): string[] {
  const wasOpen = countsAsOpen(before);
  const isOpen = countsAsOpen(after);
  if (!wasOpen && !isOpen) return [];
  const beforeKey = before?.assignee?.key ?? '';
  const afterKey = after?.assignee?.key ?? '';
  const sameTenants = (before?.tenants ?? []).join('\u0000') === (after?.tenants ?? []).join('\u0000');
  if (wasOpen && isOpen && beforeKey === afterKey && sameTenants) return [];
  return [...new Set([beforeKey, afterKey].filter((key) => key.length > 0))];
}
