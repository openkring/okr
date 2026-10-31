// apps/functions/src/task/index.ts
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';

import { setBadgePartForPerson } from '../badge/person-part';
import { pushToPersons } from '../srv/push';
import { assigneesToRecompute, decideDiaryTransition, decideTaskPush, openTaskCountFilters, TASK_LIST_URL, type TaskDocLike } from './task-decisions';
import { applyTaskToDiary } from './task-diary';
import type { TaskWrittenEvent } from './task-written-event';

export { runTaskDaily } from './task-daily';
export { listGroupTasks } from './list-group-tasks';

const TASK_COLLECTION = 'tasks';

/**
 * Firestore trigger that sends an FCM push notification to a task's assignee
 * whenever a task is created, reassigned, or reopened.
 *
 * The push/skip decision (create vs. reassignment vs. reopen, self-assignment, done/archived/
 * unassigned) lives in `decideTaskPush` (spec 1.72 §7.1).
 *
 * Badge count mirrors the app's open-task count (app.store.ts `openTasksResource`, built on
 * `getSystemQuery`): isArchived==false, tenants array-contains-any [tenantId, 'system'],
 * completionDate=='', assignee.key == personKey. See `openTaskCountFilters`.
 *
 * The same count is the task part of the server badge ledger (spec 1.127 §3.7 B1), recomputed for
 * every assignee the write affects (`assigneesToRecompute`), pushed or not.
 */
export const handleTaskWritten = async (event: TaskWrittenEvent): Promise<void> => {
    const before = event.data?.before?.data() as TaskDocLike | undefined;
    const after = event.data?.after?.data() as TaskDocLike | undefined;

    const db = getFirestore();

    // A diary-sync failure must never prevent the push below it — best-effort, logged and
    // swallowed, same rationale as `logArchiveActivity` in `task-daily.ts`.
    try {
      const transition = decideDiaryTransition(before, after);
      const beforeDone = (before?.completionDate ?? '') !== '';
      const afterDone = (after?.completionDate ?? '') !== '';
      if (transition === 'none' && beforeDone !== afterDone) {
        logger.info(`onTaskWritten: diary skipped — no assignee on the transitioning side task=${event.params['taskId']}`);
      }
      if (transition !== 'none') {
        const tenantId = (after ?? before)?.tenants?.[0] ?? '';
        if (tenantId) {
          // reopen removes the line that was actually written on completion — `before.name`,
          // not the (possibly since-renamed) current name; see `applyTaskToDiary`'s doc comment.
          const doc = transition === 'complete' ? after! : before!;
          const results = await applyTaskToDiary(
            db, tenantId, doc.assignee!.key!, doc.completionDate!, doc.name ?? '', transition,
          );
          logger.info(`onTaskWritten: diary ${transition} → ${JSON.stringify(results)} task=${event.params['taskId']}`);
        }
      }
    } catch (error) {
      logger.error(`onTaskWritten: diary sync failed task=${event.params['taskId']}`, error);
    }

    // Open-task count per assignee, queried at most once per write — the ledger and the push
    // data below share it.
    const counts = new Map<string, Promise<number>>();
    const openTaskCount = (tenantId: string, assigneeKey: string): Promise<number> => {
      const cacheKey = `${tenantId}\u0000${assigneeKey}`;
      let count = counts.get(cacheKey);
      if (!count) {
        let openQuery: FirebaseFirestore.Query = db.collection(TASK_COLLECTION);
        for (const [field, op, value] of openTaskCountFilters(tenantId, assigneeKey)) {
          openQuery = openQuery.where(field, op, value);
        }
        count = openQuery.count().get().then((snap) => snap.data().count);
        counts.set(cacheKey, count);
      }
      return count;
    };

    // The task part of the server badge ledger (spec 1.127 §3.7 B1), for every assignee whose
    // count this write changed — also on complete, archive, delete and re-assignment AWAY, which
    // send no push. Written BEFORE the push: `pushToPersons` reads the sum for `aps.badge`.
    const ledgerTenant = (after ?? before)?.tenants?.[0];
    if (ledgerTenant) {
      for (const key of assigneesToRecompute(before, after)) {
        await setBadgePartForPerson(key, ledgerTenant, 'tasks', () => openTaskCount(ledgerTenant, key), 'onTaskWritten');
      }
    }

    if (!decideTaskPush(before, after)) return;

    const assigneeKey = after?.assignee?.key ?? '';
    const tenantId = after?.tenants?.[0];
    if (!tenantId) return;

    // Recipient-independent: the web data carries the plain count; the `registered` gate is
    // applied per account in the ledger (`badgePartFor`), which is what native badges show.
    const badgeCount = await openTaskCount(tenantId, assigneeKey);

    const title = after?.name || 'Neue Aufgabe';
    const body = after?.dueDate
      ? `Fällig: ${convertDateFormatToString(after.dueDate, DateFormat.StoreDate, DateFormat.ViewDate, false)}`
      : 'Neue Aufgabe zugewiesen';

    // The task part of the badge (spec 1.93): the assignee's absolute open-task count. The
    // service worker adds the chat and invitation parts from its ledger — see `srv/push.ts`.
    const result = await pushToPersons(
      [assigneeKey],
      { type: 'task', tenantId, title, body, url: TASK_LIST_URL, badgeTasks: badgeCount },
      'onTaskWritten',
    );

    logger.info(
      `onTaskWritten: badgeCount=${badgeCount} sent=${result.sent} ` +
      `failed=${result.failed} task=${event.params['taskId']}`
    );
};

