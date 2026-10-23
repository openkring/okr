import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { DocumentCollection, DocumentModel } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';

import { getHtmlSanitizer } from '../publicApi/sanitize';
import { zurichStoreDate } from '../video/chat-video.util';
import { assertDocInRoom, decideSave, learningActor, loadRoom, parseSaveRequest } from './learning-auth';

const CF_NAME = 'saveLearningItem';

/**
 * A curator edits an item of a learning room (spec 1.115 §5.3/§5.4): title, topic tags, notes,
 * links, attachments. Only the provided fields are written, each behind its rule (learning-auth).
 * Notes are sanitised with the public API's sanitizer — a public room hands them to a static site.
 */
export const saveLearningItem = onCall(
  { region: 'europe-west6', enforceAppCheck: true, cors: true },
  async (request: CallableRequest<unknown>): Promise<{ ok: true }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const req = parseSaveRequest(request.data);

    const db = getFirestore();
    const { config, groupKey } = await loadRoom(db, tenantId, req.pageKey);
    const actor = await learningActor(db, request.auth?.uid ?? '', tenantId, groupKey);
    const ref = db.collection(DocumentCollection).doc(req.docKey);
    const doc = (await ref.get()).data() as Partial<DocumentModel> | undefined;
    assertDocInRoom(doc, config, tenantId);

    const patch = decideSave(config, actor, doc, req, await getHtmlSanitizer(), zurichStoreDate(new Date()));

    if (req.attachmentKeys?.length) {
      const snaps = await db.getAll(...req.attachmentKeys.map(k => db.collection(DocumentCollection).doc(k)));
      const missing = snaps.some(s => {
        const a = s.data() as Partial<DocumentModel> | undefined;
        return !a || !a.tenants?.includes(tenantId) || a.isArchived === true;
      });
      if (missing) throw new HttpsError('invalid-argument', 'Unknown attachment.');
    }

    await ref.update(patch);
    logger.info(`${CF_NAME}: ${req.docKey} in room ${req.pageKey} for tenant ${tenantId}`, { fields: Object.keys(patch) });
    return { ok: true };
  },
);
