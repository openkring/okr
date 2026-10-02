// apps/functions/src/task/task-diary.ts
//
// Writes a completed task's name as one line into the assignee's diaries of the day it was
// completed — and removes it again on reopen (spec 1.72 §9). Runs from `onTaskWritten`. Which
// diaries receive it is the assignee's `diaryTargets` routing for `taskDone` (spec 1.77 §6.3);
// an empty routing sends nothing.

import type { Firestore } from 'firebase-admin/firestore';

import { DiaryTarget, UserCollection } from '@okr/shared-models';

import { sendToDiaries, type DiaryTargetResult } from '../diary/diary-transfer';

/**
 * Completes or reopens the assignee's diary line for `date` in every diary the assignee's user
 * IN THE TASK'S TENANT routes `taskDone` to (spec 1.77 §6.3). Reopen removes from the diaries that
 * resolve now (first match wins if a person has several active users in one tenant); a line written under since-changed settings stays (accepted limit).
 */
export async function applyTaskToDiary(
  db: Firestore, taskTenantId: string, assigneeKey: string, date: string, line: string,
  mode: 'complete' | 'reopen',
): Promise<Record<string, DiaryTargetResult>> {
  const snap = await db.collection(UserCollection)
    .where('personKey', '==', assigneeKey)
    .get();
  const source = snap.docs.find(d =>
    d.get('isArchived') !== true && ((d.get('tenants') as string[] | undefined) ?? []).includes(taskTenantId));
  if (!source) return {};
  return sendToDiaries(db, {
    personKey: assigneeKey,
    targets: source.get('diaryTargets') as DiaryTarget[] | undefined,
    source: 'taskDone', date, field: 'done', line, mode: mode === 'complete' ? 'add' : 'remove',
  });
}
