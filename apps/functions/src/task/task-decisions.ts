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

/**
 * `app-config/{tenantId}.taskArchiveDays` as read off Firestore, defensively — a legacy doc
 * predating this field, or one hand-edited to garbage, must not crash the daily job.
 * `0` means "never archive" and is kept; anything else invalid falls back to the model
 * default (30, see `AppConfigModel.taskArchiveDays`).
 */
export function resolveTaskArchiveDays(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0) return 30;
  return Math.floor(raw);
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
