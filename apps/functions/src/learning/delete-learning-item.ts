import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { DocumentCollection, DocumentModel } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';

import { zurichStoreDate } from '../video/chat-video.util';
import { assertDocInRoom, decideDelete, learningActor, loadRoom, parseDeleteRequest } from './learning-auth';

const CF_NAME = 'deleteLearningItem';

/**
 * A curator removes an item from a learning room (spec 1.115 §5.4). A doc that also sits in other
 * folders only leaves the room folder; otherwise it is archived (or its tenant detached) per the
 * deleting-models rule. Nothing is hard-deleted, neither the document nor its Storage object.
 */
export const deleteLearningItem = onCall(
  { region: 'europe-west6', enforceAppCheck: true, cors: true },
  async (request: CallableRequest<unknown>): Promise<{ ok: true }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const req = parseDeleteRequest(request.data);

    const db = getFirestore();
    const { config, groupKey } = await loadRoom(db, tenantId, req.pageKey);
    const actor = await learningActor(db, request.auth?.uid ?? '', tenantId, groupKey);
    const ref = db.collection(DocumentCollection).doc(req.docKey);
    const doc = (await ref.get()).data() as Partial<DocumentModel> | undefined;
    assertDocInRoom(doc, config, tenantId);

    const patch = decideDelete(config, actor, doc, tenantId, zurichStoreDate(new Date()));
    await ref.update(patch);
    logger.info(`${CF_NAME}: ${req.docKey} in room ${req.pageKey} for tenant ${tenantId}`, { fields: Object.keys(patch) });
    return { ok: true };
  },
);
