// apps/functions/src/task/index.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { pushToPersons } from '../srv/push';
import { decideTaskPush, TASK_LIST_URL, type TaskDocLike } from './task-decisions';

export { taskDaily } from './task-daily';

const REGION = 'europe-west6';
const TASK_COLLECTION = 'tasks';

/**
 * Firestore trigger that sends an FCM push notification to a task's assignee
 * whenever a task is created, reassigned, or reopened.
 *
 * The push/skip decision (create vs. reassignment vs. reopen, self-assignment, done/archived/
 * unassigned) lives in `decideTaskPush` (spec 1.72 §7.1).
 *
 * Badge count mirrors the dashboard query (tasks-section.store.ts):
 *   isArchived==false, tenants array-contains tenantId, completionDate=='', assignee.key == personKey.
 */
export const onTaskWritten = onDocumentWritten(
  { document: `${TASK_COLLECTION}/{taskId}`, region: REGION },
  async (event) => {
    const before = event.data?.before?.data() as TaskDocLike | undefined;
    const after = event.data?.after?.data() as TaskDocLike | undefined;

    if (!decideTaskPush(before, after)) return;

    const assigneeKey = after?.assignee?.key ?? '';
    const tenantId = after?.tenants?.[0];
    if (!tenantId) return;

    const db = getFirestore();

    // Count open tasks for the assignee — mirrors tasks-section.store.ts exactly
    const openSnap = await db.collection(TASK_COLLECTION)
      .where('isArchived', '==', false)
      .where('tenants', 'array-contains', tenantId)
      .where('completionDate', '==', '')
      .where('assignee.key', '==', assigneeKey)
      .count().get();
    const badgeCount = openSnap.data().count;

    const title = after?.name || 'Neue Aufgabe';
    const body = after?.dueDate
      ? `Fällig: ${convertDateFormatToString(after.dueDate, DateFormat.StoreDate, DateFormat.ViewDate, false)}`
      : 'Neue Aufgabe zugewiesen';

    // The task is the one sender that legitimately writes the badge: it knows the user's TOTAL
    // open count. Every calendar sender omits it — see the head of `srv/push.ts`.
    const result = await pushToPersons(
      [assigneeKey],
      { type: 'task', tenantId, title, body, url: TASK_LIST_URL, badgeCount },
      'onTaskWritten',
    );

    logger.info(
      `onTaskWritten: badgeCount=${badgeCount} sent=${result.sent} ` +
      `failed=${result.failed} task=${event.params['taskId']}`
    );
  }
);

