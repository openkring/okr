import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

import { GroupCollection } from '@okr/shared-models';

import { adminKeysNeedUpdate, groupAdminKeys } from './group-admin-keys';

/**
 * Keeps groups/{id}.adminKeys equal to the keys of admins[] so firestore.rules can test group
 * adminship with `in`. Writes only when the value differs, so its own update ends the loop after
 * one extra invocation. A deleted group is a no-op.
 */
export const onGroupWritten = onDocumentWritten(
  { document: `${GroupCollection}/{groupId}`, region: 'europe-west6' },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const data = after.data() ?? {};
    const next = groupAdminKeys(data['admins']);
    if (!adminKeysNeedUpdate(data['adminKeys'], next)) return;
    await after.ref.update({ adminKeys: next });
    logger.info('onGroupWritten: adminKeys synced', { groupId: event.params.groupId, count: next.length });
  },
);
