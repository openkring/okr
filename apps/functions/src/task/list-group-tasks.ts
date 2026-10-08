import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { GroupCollection, MembershipCollection, TaskCollection, TaskModel, UserCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, checkStringField } from '@okr/shared-util-functions';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';
import { isActiveGroupMembership, isClosedGroup, isTaskStaff } from '@okr/project-task-util';

/**
 * Spec 1.75: the tasks of a closed group (chatMode 'members'). The read rule admits them only to
 * author, assignee and staff, because a rule cannot query memberships; this callable checks the
 * caller's membership with the Admin SDK instead. Open groups are read directly by the client.
 */
export const listGroupTasks = onCall(
  { region: 'europe-west6', enforceAppCheck: true },
  async (request) => {
    const CF_NAME = 'listGroupTasks';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const groupKey = checkStringField(request as never, CF_NAME, 'groupKey');
    const tenantId = checkStringField(request as never, CF_NAME, 'tenantId');
    const archived = (request.data as { archived?: boolean })?.archived === true;
    const uid = request.auth?.uid ?? '';
    const db = getFirestore();

    const user = (await db.collection(UserCollection).doc(uid).get()).data() ?? {};
    if (!((user['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
      throw new HttpsError('permission-denied', `${CF_NAME}: caller is not in tenant ${tenantId}`);
    }
    const group = (await db.collection(GroupCollection).doc(groupKey).get()).data();
    if (!group || !((group['tenants'] as string[] | undefined) ?? []).includes(tenantId)) {
      throw new HttpsError('not-found', `${CF_NAME}: no group ${groupKey} in ${tenantId}`);
    }
    if (!isClosedGroup(group as never)) {
      throw new HttpsError('failed-precondition', `${CF_NAME}: group ${groupKey} is open`);
    }

    const personKey = (user['personKey'] as string | undefined) ?? '';
    if (!isTaskStaff(user['roles'] as Record<string, boolean> | undefined)) {
      const today = getTodayStr(DateFormat.StoreDate);
      const snap = personKey === '' ? undefined : await db.collection(MembershipCollection)
        .where('orgKey', '==', groupKey).where('memberKey', '==', personKey).get();
      const member = (snap?.docs ?? []).some(d => isActiveGroupMembership(d.data() as never, today));
      if (!member) throw new HttpsError('permission-denied', `${CF_NAME}: ${personKey} is not a member of ${groupKey}`);
    }

    const taskSnap = await db.collection(TaskCollection)
      .where('shareKey', '==', groupKey)
      .where('tenants', 'array-contains', tenantId)
      .where('isArchived', '==', archived)
      .get();
    const tasks = taskSnap.docs
      .map(d => ({ ...d.data(), okey: d.id }) as TaskModel)
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''));
    logger.info(`${CF_NAME}: uid=${uid} group=${groupKey} archived=${archived} tasks=${tasks.length}`);
    return { tasks };
  },
);
