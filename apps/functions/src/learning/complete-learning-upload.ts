import { randomUUID } from 'node:crypto';
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { DocumentCollection, DocumentModel } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import {
  assertDocInRoom, assertMayComplete, assertUploadLanded, downloadTokenMetadata, existingDownloadToken, firebaseDownloadUrl, learningActor,
  learningBucketOf, loadCaller, loadRoom, parseCompleteRequest,
} from './learning-auth';

const CF_NAME = 'completeLearningUpload';

/**
 * Second half of a learning upload (spec 1.115 §5.4): after the signed PUT the uploader (or
 * contentAdmin/admin) confirms it. The object must exist at `doc.fullPath` with exactly `doc.size`
 * bytes, else failed-precondition (the client then removes the doc). A default-bucket object gets
 * its Firebase download token via the admin SDK (a signed `x-goog-meta-*` header would be
 * lower-cased by GCS and never be honoured) and `doc.url` becomes the token URL. Private-bucket
 * videos are only verified: they have no token URL, signVideoUrls signs them.
 */
export const completeLearningUpload = onCall(
  { region: 'europe-west6', enforceAppCheck: true, cors: true },
  async (request: CallableRequest<unknown>): Promise<{ url: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const req = parseCompleteRequest(request.data);

    const db = getFirestore();
    const { tenantId, user } = await loadCaller(db, request.auth?.uid ?? '');
    const actor = learningActor(user);
    const { config } = await loadRoom(db, tenantId, req.pageKey);
    const ref = db.collection(DocumentCollection).doc(req.docKey);
    const doc = (await ref.get()).data() as Partial<DocumentModel> | undefined;
    assertDocInRoom(doc, config, tenantId);
    assertMayComplete(actor, doc);
    if (typeof doc.fullPath !== 'string' || !doc.fullPath.startsWith(`tenant/${tenantId}/folder/${config.folder}/`)) {
      throw new HttpsError('failed-precondition', 'Document has no upload in this room.');
    }

    const target = learningBucketOf(doc);
    const bucket = target === 'private' ? privateBucket() : getStorage().bucket();
    const file = bucket.file(doc.fullPath);
    const [exists] = await file.exists();
    const metadata = exists ? (await file.getMetadata())[0] : undefined;
    assertUploadLanded(exists, metadata?.size, doc);

    if (target === 'private') {
      logger.info(`${CF_NAME}: verified video ${req.docKey} for tenant ${tenantId}`);
      return { url: '' };
    }
    let token = existingDownloadToken(metadata?.metadata as Record<string, unknown> | undefined);
    if (!token) {
      token = randomUUID();
      await file.setMetadata(downloadTokenMetadata(token));
    }
    const url = firebaseDownloadUrl(bucket.name, doc.fullPath, token);
    await ref.update({ url });
    logger.info(`${CF_NAME}: completed ${req.docKey} for tenant ${tenantId}`);
    return { url };
  },
);
