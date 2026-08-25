// apps/functions/src/workflow/activity.ts
//
// The workflow feature's activity-log row.
//
// It lives in its own module because BOTH halves of the feature write it: the engine
// (through WorkflowDeps.logActivity) and the outbox function that performs the queued side
// effect. The outbox is the only place a Matrix/Mailgun failure can surface, and nothing in
// the app reads `workflow-outbox` — so a failure that is not mirrored here is invisible to
// the admin, while the reporter has already been told their report was filed.

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';

import { AvatarInfo } from '@okr/shared-models';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

/** Author stamped on tasks and activities created by the engine. */
export const SYSTEM_AUTHOR: AvatarInfo = {
  key: '',
  name1: 'System',
  name2: '',
  modelType: 'user',
  type: '',
  subType: '',
  label: 'System',
};

/**
 * Append one workflow row to `activities`. Best-effort: the log is a diagnostic, so a
 * failure to write it must never take down the action it is describing.
 */
export async function logWorkflowActivity(tenantId: string, payload: Record<string, unknown>): Promise<void> {
  try {
    const timestamp = getTodayStr(DateFormat.StoreDateTime);
    await getFirestore().collection('activities').add({
      tenants: [tenantId],
      isArchived: false,
      timestamp,
      scope: 'workflow',
      action: 'update',
      roleNeeded: 'admin',
      payload: JSON.stringify(payload),
      author: SYSTEM_AUTHOR,
      index: `t:${timestamp} c:workflow a:update p:System`,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    logger.error(`workflow: could not write activity`, error);
  }
}
