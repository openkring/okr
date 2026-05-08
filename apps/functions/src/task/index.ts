// apps/functions/src/task/index.ts
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

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

    // Resolve assignee's Firebase uid from their personKey
    const usersSnap = await db.collection('users').where('personKey', '==', assigneeKey).limit(1).get();
    if (usersSnap.empty) return;
    const uid = usersSnap.docs[0].id;

    // Collect all registered FCM tokens for this user
    const tokensSnap = await db.collection('users').doc(uid).collection('fcmTokens').get();
    const tokenEntries: { token: string; docId: string }[] = [];
    for (const doc of tokensSnap.docs) {
      const token = doc.data()['token'] as string | undefined;
      if (token) tokenEntries.push({ token, docId: doc.id });
    }
    if (tokenEntries.length === 0) return;

    // Count open tasks for the assignee — mirrors tasks-section.store.ts exactly
    const openSnap = await db.collection(TASK_COLLECTION)
      .where('isArchived', '==', false)
      .where('tenants', 'array-contains', tenantId)
      .where('completionDate', '==', '')
      .get();
    const badgeCount = openSnap.docs.filter(doc => doc.data()['assignee']?.key === assigneeKey).length;

    const title = after.name || 'Neue Aufgabe';
    const body = after.dueDate
      ? `Fällig: ${formatStoreDate(after.dueDate)}`
      : 'Neue Aufgabe zugewiesen';

    // Data-only message: ensures the service worker's onBackgroundMessage handler is always
    // called on web. When the notification field is present, some browsers auto-display it
    // and skip the SW handler, preventing the badge from being updated.
    const response = await getMessaging().sendEachForMulticast({
      tokens: tokenEntries.map(e => e.token),
      data: {
        type: 'task',
        title,
        body,
        url: '/task/my/all',
        badgeCount: String(badgeCount),
      },
      android: { priority: 'normal' },
      apns: {
        headers: { 'apns-priority': '5', 'apns-push-type': 'background' },
        payload: { aps: { badge: badgeCount, 'content-available': 1 } },
      },
    });

    // Remove tokens that are no longer registered to avoid future failures
    const deletions: Promise<unknown>[] = [];
    response.responses.forEach((r, i) => {
      if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
        deletions.push(
          db.collection('users').doc(uid).collection('fcmTokens').doc(tokenEntries[i].docId).delete()
            .catch(err => console.warn('onTaskWritten: Failed to delete stale token:', err))
        );
      }
    });
    await Promise.all(deletions);

    console.log(
      `onTaskWritten: badgeCount=${badgeCount} sent=${response.successCount} ` +
      `failed=${response.failureCount} task=${event.params['taskId']}`
    );
  }
);

/** Format yyyyMMdd store date → dd.MM.yyyy for display in notification body */
function formatStoreDate(storeDate: string): string {
  if (!storeDate || storeDate.length !== 8) return storeDate;
  return `${storeDate.slice(6, 8)}.${storeDate.slice(4, 6)}.${storeDate.slice(0, 4)}`;
}
