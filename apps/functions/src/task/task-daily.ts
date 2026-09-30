// apps/functions/src/task/task-daily.ts
//
// Daily job: archive tasks completed long enough ago (`app-config.taskArchiveDays`, spec
// 1.72 §8), and remind assignees of tasks due today (spec 1.72 §7.2).
//
// One tenant's `app-config` doc drives its own archive window; the two halves of the job run
// per tenant so one tenant's failure (bad data, a transient Firestore error) never stops the
// rest — see the try/catch in `taskDaily` below.

import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getFirestore, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getTodayStr } from '@okr/shared-util-core';

import { pushToPersons } from '../srv/push';
import { getArchiveCutoff, resolveTaskArchiveDays, TASK_LIST_URL } from './task-decisions';

const REGION = 'europe-west6';
const TASK_COLLECTION = 'tasks';
const BATCH_SIZE = 400;

/**
 * Archives every completed task of `tenantId` whose `completionDate` is strictly before
 * `cutoff` (a task completed ON the cutoff day survives — see task-6 brief). Skipped entirely
 * when `cutoff` is `''` (`taskArchiveDays === 0`, "never").
 *
 * The delete patch mirrors `getDeletePatch` (`@okr/shared-util-core`): a task that belongs to
 * this tenant alone is archived; a task shared with another tenant just loses this tenant,
 * the same archive-vs-detach rule every model delete follows (see `deleting-models`).
 */
export async function archiveCompleted(db: Firestore, tenantId: string, cutoff: string): Promise<void> {
  if (!cutoff) return;

  const snap = await db.collection(TASK_COLLECTION)
    .where('tenants', 'array-contains', tenantId)
    .where('isArchived', '==', false)
    .where('completionDate', '>', '')
    .where('completionDate', '<', cutoff)
    .get();

  let archived = 0;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + BATCH_SIZE)) {
      const tenants = (doc.get('tenants') as string[] | undefined) ?? [];
      const rest = tenants.filter((t) => t !== tenantId);
      const patch = rest.length > 0 && rest.length < tenants.length
        ? { tenants: FieldValue.arrayRemove(tenantId) }
        : { isArchived: true };
      batch.update(doc.ref, patch);
      archived += 1;
    }
    await batch.commit();
  }
  logger.info(`taskDaily: archived=${archived} tenant=${tenantId}`);
}

/**
 * Pushes every assignee whose open (not done, not archived) task is due today — a same-day
 * nudge, not a re-send of the create/reassign/reopen push `decideTaskPush` already covers.
 */
export async function remindDueToday(db: Firestore, tenantId: string, today: string): Promise<void> {
  const snap = await db.collection(TASK_COLLECTION)
    .where('tenants', 'array-contains', tenantId)
    .where('isArchived', '==', false)
    .where('completionDate', '==', '')
    .where('dueDate', '==', today)
    .get();

  for (const doc of snap.docs) {
    const assigneeKey = (doc.get('assignee') as { key?: string } | undefined)?.key ?? '';
    if (!assigneeKey) continue;
    await pushToPersons(
      [assigneeKey],
      { type: 'task', tenantId, title: (doc.get('name') as string) ?? '', body: 'Heute fällig', url: TASK_LIST_URL },
      'taskDaily',
    );
  }
}

/**
 * Runs once a day at 07:00 Europe/Zurich for every tenant in `app-config`. Cloud Functions
 * containers run in UTC, but at 07:00 Zurich time (UTC+1/+2) it is still the same calendar day
 * in UTC, so `getTodayStr()` — which reads the container's local (UTC) date — agrees with the
 * Zurich calendar day this job is meant to act on.
 */
export const taskDaily = onSchedule(
  { region: REGION, schedule: 'every day 07:00', timeZone: 'Europe/Zurich' },
  async () => {
    const db = getFirestore();
    const today = getTodayStr();
    const configs = await db.collection('app-config').get();
    for (const cfg of configs.docs) {
      const tenantId = cfg.id;
      try {
        await archiveCompleted(db, tenantId, getArchiveCutoff(today, resolveTaskArchiveDays(cfg.get('taskArchiveDays'))));
        await remindDueToday(db, tenantId, today);
      } catch (e) {
        logger.error(`taskDaily: tenant=${tenantId} failed`, e);   // one tenant never stops the others
      }
    }
  },
);
