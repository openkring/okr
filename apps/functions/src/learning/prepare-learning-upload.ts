import { randomUUID } from 'node:crypto';
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { DocumentCollection, DocumentModel, FolderCollection, FolderModel } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { safeVideoTitle, zurichStoreDate } from '../video/chat-video.util';
import {
  assertUploadPath, decideUpload, learningActor, learningDocumentIndex, learningUploadHeaders, learningUploadPath, loadCaller, loadRoom,
  parseUploadRequest,
} from './learning-auth';

const CF_NAME = 'prepareLearningUpload';
const UPLOAD_WINDOW_MS = 15 * 60 * 1000;

export interface LearningUpload {
  docKey: string;
  uploadUrl: string;
  contentType: string;
  maxBytes: number;
  /**
   * The headers the PUT to `uploadUrl` must carry, verbatim — they are part of the v4 signature
   * (Content-Type, x-goog-content-length-range). A missing or changed header fails the upload.
   */
  headers: Record<string, string>;
}

/** The plain object FirestoreService would write: class fields, minus `okey` (the document id). */
function stripKey<T extends { okey: string }>(model: T): Omit<T, 'okey'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { okey, ...data } = model;
  return { ...data };
}

/**
 * A curator uploads into a topic of a learning room (spec 1.115 §5.4). The function checks the
 * curator right for the topic, creates the document in the room folder (tagged with the topic,
 * authored by the caller) and returns a signed v4 PUT URL bound to the content type and the declared
 * size. Videos go to the private bucket in the folder album layout (played through signVideoUrls,
 * capped at MAX_VIDEO_BYTES); images and files to the default bucket (25 MB). The client uploads
 * with exactly `Content-Type: <contentType>` and `x-goog-content-length-range: 0,<maxBytes>`, then
 * calls completeLearningUpload, which verifies the object and sets the download token and `doc.url`.
 */
export const prepareLearningUpload = onCall(
  { region: 'europe-west6', enforceAppCheck: true, cors: true },
  async (request: CallableRequest<unknown>): Promise<LearningUpload> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const req = parseUploadRequest(request.data);

    const db = getFirestore();
    const { tenantId, user } = await loadCaller(db, request.auth?.uid ?? '');
    const actor = learningActor(user);
    const { config } = await loadRoom(db, tenantId, req.pageKey);
    const decision = decideUpload(config, actor, req);

    const folder = (await db.collection(FolderCollection).doc(config.folder).get()).data() as Partial<FolderModel> | undefined;
    if (!folder || !folder.tenants?.includes(tenantId) || folder.isArchived === true) {
      throw new HttpsError('failed-precondition', 'Learning room folder not found.');
    }

    const fullPath = learningUploadPath(tenantId, config.folder, req.fileName, randomUUID());
    assertUploadPath(fullPath, tenantId, decision);
    const bucket = decision.bucket === 'private' ? privateBucket() : getStorage().bucket();
    const headers = learningUploadHeaders(decision);
    const { 'Content-Type': _contentType, ...extensionHeaders } = headers;
    // Sign first: a signing failure must not leave a document behind that no upload can ever fill.
    const [uploadUrl] = await bucket.file(fullPath).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + UPLOAD_WINDOW_MS,
      contentType: _contentType,
      extensionHeaders,
    });

    const today = zurichStoreDate(new Date());
    const doc = new DocumentModel(tenantId);
    doc.title = safeVideoTitle(req.fileName);
    doc.fullPath = fullPath;
    doc.mimeType = decision.contentType;
    doc.size = req.size;
    doc.folderKeys = [config.folder];
    doc.tags = req.topic;
    doc.authorKey = actor.personKey;
    doc.authorName = actor.name;
    // Filled by completeLearningUpload once the PUT has landed (default bucket: the Firebase token URL).
    doc.url = '';
    doc.dateOfDocCreation = today;
    doc.dateOfDocLastUpdate = today;
    doc.version = '1.0';
    doc.index = learningDocumentIndex(doc);
    const docRef = await db.collection(DocumentCollection).add(stripKey(doc));

    logger.info(`${CF_NAME}: prepared ${docRef.id} in ${config.folder} for tenant ${tenantId}`, { tab: decision.tab, size: req.size });
    return { docKey: docRef.id, uploadUrl, contentType: decision.contentType, maxBytes: decision.maxBytes, headers };
  },
);
