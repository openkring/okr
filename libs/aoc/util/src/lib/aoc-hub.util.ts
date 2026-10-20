import { DateFormat, parseDate } from '@okr/shared-util-core';

/** The fields of an `activities` entry the hub's «last run» needs. */
export interface AocRunEntry {
  action: string;
  timestamp: string;
  isArchived: boolean;
}

/**
 * Reduces the tenant's `scope: 'aoc'` activities to the newest run per operation id
 * (`action`). One query for all of them, reduced here, needs no composite index beyond the
 * existing `tenants` + `scope` one.
 */
export function lastRunsByOperation(entries: readonly AocRunEntry[]): Record<string, Date> {
  const newest: Record<string, string> = {};
  for (const e of entries) {
    if (e.isArchived || !e.action || !e.timestamp) continue;
    if (!newest[e.action] || e.timestamp > newest[e.action]) newest[e.action] = e.timestamp;
  }
  const runs: Record<string, Date> = {};
  for (const [action, timestamp] of Object.entries(newest)) {
    const date = parseDate(timestamp, DateFormat.StoreDateTime, false);
    if (date) runs[action] = date;
  }
  return runs;
}

export interface IndexDiff<T> {
  model: T;
  oldIndex: string;
  newIndex: string;
}

/** The models whose stored search index differs from the generated one (the reindex preview). */
export function indexDiffs<T extends { index?: string }>(models: readonly T[], generateIndexFn: (model: T) => string): IndexDiff<T>[] {
  const diffs: IndexDiff<T>[] = [];
  for (const model of models) {
    const oldIndex = model.index ?? '';
    const newIndex = generateIndexFn(model);
    if (oldIndex !== newIndex) diffs.push({ model, oldIndex, newIndex });
  }
  return diffs;
}

/** A Vest `getErrors()` map as one line per field and message, for a report finding's detail. */
export function formatValidationErrors(errors: Record<string, string[]>): string {
  return Object.entries(errors)
    .flatMap(([field, messages]) => messages.map(message => `${field}: ${message}`))
    .join('\n');
}
