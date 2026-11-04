// apps/functions/src/task/task-diary.ts
//
// Writes a completed task's name as one line into the assignee's diaries of the day it was
// completed — and removes it again on reopen (spec 1.72 §9). Runs from the `notify` handler of `onTaskDocWritten`. Which
// diaries receive it is `resolveDiaryPulls` for `taskDone` with the task's tenant as the source app (spec 1.77 §12.5);
// no diary asking sends nothing.

import type { Firestore } from 'firebase-admin/firestore';

import { sendToDiaries, type DiaryTargetResult } from '../diary/diary-transfer';

/**
 * Completes or reopens the assignee's diary line for `date` in every diary that collects `taskDone` from the task's
 * tenant. Reopen removes from the diaries that resolve now; a line written under since-changed settings stays (accepted limit).
 */
export async function applyTaskToDiary(
  db: Firestore, taskTenantId: string, assigneeKey: string, date: string, line: string,
  mode: 'complete' | 'reopen',
): Promise<Record<string, DiaryTargetResult>> {
  return sendToDiaries(db, {
    personKey: assigneeKey,
    sourceTenant: taskTenantId,
    source: 'taskDone', date, field: 'done', line, mode: mode === 'complete' ? 'add' : 'remove',
  });
}
