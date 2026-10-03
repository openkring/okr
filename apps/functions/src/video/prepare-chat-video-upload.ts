import { randomUUID } from 'node:crypto';
import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

import { DocumentCollection, DocumentModel, FolderCollection, FolderModel } from '@okr/shared-models';
import { addIndexElement, getMimeType } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { getJoinedMemberIds, matrixAdminToken, requireRoomInTenant, requireUserPersonKey, serverHostname } from '../matrix-simple/shared';
import {
  assertChatFolders, chatFolderKeys, chatVideoPath, MAX_VIDEO_BYTES, safeVideoTitle, validateChatVideoRequest, zurichStoreDate,
} from './chat-video.util';

const CF_NAME = 'prepareChatVideoUpload';
const ALREADY_EXISTS = 6;
const UPLOAD_WINDOW_MS = 15 * 60 * 1000;
const MAX_ROOM_NAME = 80;

export interface ChatVideoUpload {
  docKey: string;
  uploadUrl: string;
  contentType: string;
  maxBytes: number;
}

const isAlreadyExists = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === ALREADY_EXISTS;

/** The plain object FirestoreService would write: class fields, minus `okey` (the document id). */
function stripKey<T extends { okey: string }>(model: T): Omit<T, 'okey'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { okey, ...data } = model;
  return { ...data };
}

function folder(tenantId: string, name: string, parents: string[], matrixRoomId: string): Omit<FolderModel, 'okey'> {
  const f = new FolderModel(tenantId);
  f.name = name;
  f.title = name;
  f.parents = parents;
  f.matrixRoomId = matrixRoomId;
  f.ownerKey = '';
  f.membersMayUpload = false;
  f.coverDocumentKey = '';
  f.isArchived = false;
  f.tags = '';
  f.description = '';
  f.index = addIndexElement('', 'n', name);
  return stripKey(f);
}

/**
 * Creates `folders/<key>` unless it exists. An existing folder is never overwritten (a member may
 * have renamed it); only ALREADY_EXISTS is tolerated, any other error propagates. Returns the
 * folder as it now stands: the data written, or the existing folder's data.
 */
async function createIfAbsent(db: Firestore, key: string, data: object): Promise<Record<string, unknown> | undefined> {
  const ref = db.collection(FolderCollection).doc(key);
  try {
    await ref.create(data);
    return data as Record<string, unknown>;
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    return (await ref.get()).data();
  }
}

/**
 * A chat video becomes a document in the room's album in the private bucket (spec 1.82 §8): the
 * function checks that the caller is a CURRENT joined member of the room (live from Synapse, before
 * any write), creates the room album's three folders if absent (`Chat · <room>` → `<year>` →
 * `videos`, deterministic keys so concurrent senders share them), adds the document and returns a
 * signed v4 PUT URL bound to the content type and the size limit. The client uploads with exactly
 * `Content-Type: <contentType>` and `x-goog-content-length-range: 0,<maxBytes>`.
 */
export const prepareChatVideoUpload = onCall(
  { region: 'europe-west6', enforceAppCheck: true, cors: true, secrets: [matrixAdminToken] },
  async (request: CallableRequest<unknown>): Promise<ChatVideoUpload> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const uid = request.auth?.uid ?? '';
    const personKey = await requireUserPersonKey(uid, CF_NAME);
    const req = validateChatVideoRequest(request.data);

    // Room checks — all of them before the first write.
    const adminToken = matrixAdminToken.value();
    await requireRoomInTenant(req.roomId, uid, CF_NAME, adminToken);
    const callerId = `@${personKey.toLowerCase()}:${serverHostname()}`;
    let joined: Set<string>;
    try {
      joined = await getJoinedMemberIds(req.roomId, adminToken);
    } catch (error) {
      logger.warn(`${CF_NAME}: room membership lookup failed`, { roomId: req.roomId, error: String(error) });
      throw new HttpsError('unavailable', 'Room membership could not be checked.');
    }
    if (!joined.has(callerId)) {
      throw new HttpsError('permission-denied', 'Not a member of this room.');
    }

    const today = zurichStoreDate(new Date());
    const year = today.slice(0, 4);
    const keys = chatFolderKeys(tenantId, req.roomId, year);
    const roomName = req.roomName.trim().slice(0, MAX_ROOM_NAME);
    const rootName = roomName ? `Chat · ${roomName}` : 'Chat';

    const db = getFirestore();
    const root = await createIfAbsent(db, keys.root, folder(tenantId, rootName, [], req.roomId));
    // Never create children under a root that belongs to another room.
    if ((root?.['matrixRoomId'] ?? '') !== req.roomId) {
      logger.error(`${CF_NAME}: folder ${keys.root} exists for another room, refusing`, { roomId: req.roomId });
      throw new HttpsError('failed-precondition', 'Room album folder conflict.');
    }
    const yearFolder = await createIfAbsent(db, keys.year, folder(tenantId, year, [keys.root], ''));
    const videosFolder = await createIfAbsent(db, keys.videos, folder(tenantId, 'videos', [keys.year], ''));
    try {
      assertChatFolders({ root, year: yearFolder, videos: videosFolder }, keys, req.roomId, tenantId);
    } catch (error) {
      logger.error(`${CF_NAME}: room album chain under ${keys.root} was moved or archived, refusing`, { roomId: req.roomId });
      throw error;
    }

    const fullPath = chatVideoPath(tenantId, keys.videos, req.fileName, randomUUID());
    const contentType = getMimeType(fullPath) || 'application/octet-stream';
    // Sign first: a signing failure must not leave a document behind that no upload can ever fill.
    const [uploadUrl] = await privateBucket().file(fullPath).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + UPLOAD_WINDOW_MS,
      contentType,
      extensionHeaders: { 'x-goog-content-length-range': `0,${MAX_VIDEO_BYTES}` },
    });

    const doc = new DocumentModel(tenantId);
    doc.title = safeVideoTitle(req.fileName);
    doc.fullPath = fullPath;
    doc.mimeType = getMimeType(fullPath) || req.mimeType;
    doc.size = req.size;
    doc.folderKeys = [keys.videos];
    doc.authorKey = personKey;
    doc.url = '';
    doc.dateOfDocCreation = today;
    doc.dateOfDocLastUpdate = today;
    doc.version = '1.0';
    doc.tags = `@tag.${tenantId},@tag.album`;
    let index = addIndexElement('', 'n', doc.title);
    index = addIndexElement(index, 'm', doc.mimeType);
    doc.index = addIndexElement(index, 'f', doc.folderKeys.join(' '));
    const docRef = await db.collection(DocumentCollection).add(stripKey(doc));

    logger.info(`${CF_NAME}: prepared ${docRef.id} in ${keys.videos} for tenant ${tenantId}`, { roomId: req.roomId, size: req.size });
    return { docKey: docRef.id, uploadUrl, contentType, maxBytes: MAX_VIDEO_BYTES };
  },
);
