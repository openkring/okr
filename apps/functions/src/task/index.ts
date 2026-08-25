// apps/functions/src/task/index.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { pushToPersons } from '../srv/push';

const REGION = 'europe-west6';
const TASK_COLLECTION = 'tasks';

// Inlined to avoid monorepo cross-bundle imports (same pattern as calendar/index.ts)
interface TaskDoc {
  name: string;
  state: string;
  isArchived: boolean;
  completionDate: string;
  dueDate: string;
  assignee?: { key: string };
  tenants: string[];
}

/**
 * Firestore trigger that sends an FCM push notification to a task's assignee
 * whenever a task is created, reassigned, or reopened.
 *
 * Notification conditions:
 *   - Create: task has an assignee and is not already done/archived
 *   - Update: assignee changed to a new person, OR completionDate was cleared (task reopened)
 *   - Never: task is done (state == 'done' OR completionDate != ''), archived, or has no assignee
 *
 * Badge count mirrors the dashboard query (tasks-section.store.ts):
 *   isArchived==false, tenants array-contains tenantId, completionDate=='',
 *   then in-memory filter: assignee.key == personKey
 */
export const onTaskWritten = onDocumentWritten(
  { document: `${TASK_COLLECTION}/{taskId}`, region: REGION },
  async (event) => {
    const before = event.data?.before?.data() as TaskDoc | undefined;
    const after = event.data?.after?.data() as TaskDoc | undefined;

    // Skip deletes
    if (!after) return;

    // Skip if done, archived, or has no assignee
    if (after.isArchived || after.completionDate !== '' || after.state === 'done') return;
    if (!after.assignee?.key) return;

    const assigneeKey = after.assignee.key;
    const isCreate = !before;
    const assigneeChanged = !isCreate && before?.assignee?.key !== assigneeKey;
    const taskReopened = !isCreate && (before?.completionDate ?? '') !== '' && after.completionDate === '';

    // Only notify on create, assignee change, or reopen — skip plain edits
    if (!isCreate && !assigneeChanged && !taskReopened) return;

    const tenantId = after.tenants?.[0];
    if (!tenantId) return;

    const db = getFirestore();

    // Count open tasks for the assignee — mirrors tasks-section.store.ts exactly
    const openSnap = await db.collection(TASK_COLLECTION)
      .where('isArchived', '==', false)
      .where('tenants', 'array-contains', tenantId)
      .where('completionDate', '==', '')
      .get();
    const badgeCount = openSnap.docs.filter(doc => doc.data()['assignee']?.key === assigneeKey).length;

    const title = after.name || 'Neue Aufgabe';
    const body = after.dueDate
      ? `Fällig: ${convertDateFormatToString(after.dueDate, DateFormat.StoreDate, DateFormat.ViewDate, false)}`
      : 'Neue Aufgabe zugewiesen';

    // The task is the one sender that legitimately writes the badge: it knows the user's TOTAL
    // open count. Every calendar sender omits it — see the head of `srv/push.ts`.
    const result = await pushToPersons(
      [assigneeKey],
      { type: 'task', title, body, url: '/task/my/all', badgeCount },
      'onTaskWritten',
    );

    logger.info(
      `onTaskWritten: badgeCount=${badgeCount} sent=${result.sent} ` +
      `failed=${result.failed} task=${event.params['taskId']}`
    );
  }
);

