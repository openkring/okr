import { onCall, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { DocumentCollection, DocumentModel } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { zurichStoreDate } from '../video/chat-video.util';
import { assertDocInRoom, decideDelete, learningActor, loadCaller, loadRoom, parseDeleteRequest } from './learning-auth';

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
    const req = parseDeleteRequest(request.data);

    const db = getFirestore();
    const { tenantId, user } = await loadCaller(db, request.auth?.uid ?? '');
    const actor = learningActor(user);
    const { config } = await loadRoom(db, tenantId, req.pageKey);
    const ref = db.collection(DocumentCollection).doc(req.docKey);

    // read → decide → write in one transaction (the detach patch is computed from folderKeys as read).
    const patch = await db.runTransaction(async tx => {
      const doc = (await tx.get(ref)).data() as Partial<DocumentModel> | undefined;
      assertDocInRoom(doc, config, tenantId);
      const p = decideDelete(config, actor, doc, tenantId, zurichStoreDate(new Date()));
      tx.update(ref, p);
      return p;
    });
    logger.info(`${CF_NAME}: ${req.docKey} in room ${req.pageKey} for tenant ${tenantId}`, { fields: Object.keys(patch) });
    return { ok: true };
  },
);
