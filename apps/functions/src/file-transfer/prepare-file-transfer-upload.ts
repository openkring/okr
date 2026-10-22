import { onCall, CallableRequest, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import {
  AppConfig, AppConfigCollection, FileTransferCollection, FileTransferEventCollection, FileTransferEventModel, FileTransferFile, FileTransferModel,
  UserModel,
} from '@okr/shared-models';
import { isKioskOnly } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import {
  checkFileTransferRequest, computeExpiresAt, openBytes, PrepareFileTransferUploadRequest, PrepareFileTransferUploadResponse, resolveFileTransferLimits,
} from '@okr/content-file-transfer-util';

import { privateBucket } from '../_storage/private-bucket';
import { fileTransferFilePath, normalizeUploadOrigin } from './file-transfer-storage';

const CF_NAME = 'prepareFileTransferUpload';
const MAX_FILES = 100;

/** Plain object FirestoreService would write: class fields minus `okey` (the document id). */
function stripKey<T extends { okey: string }>(model: T): Omit<T, 'okey'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { okey, ...data } = model;
  return { ...data };
}

function invalid(message: string): HttpsError {
  return new HttpsError('invalid-argument', message);
}

/** Shape check of the untrusted payload; throws invalid-argument. Size/limit rules live in checkFileTransferRequest. */
function parseRequest(data: unknown): PrepareFileTransferUploadRequest {
  const d = (data ?? {}) as Partial<PrepareFileTransferUploadRequest>;
  if (!Array.isArray(d.files) || d.files.length < 1 || d.files.length > MAX_FILES) throw invalid('files');
  for (const f of d.files) {
    if (!f || typeof f.name !== 'string' || f.name.trim() === '' || f.name.length > 255) throw invalid('file name');
    if (!Number.isSafeInteger(f.size) || f.size <= 0) throw invalid('file size');
    if (typeof f.contentType !== 'string') throw invalid('file contentType');
  }
  if (!Array.isArray(d.emails) || !d.emails.every(e => typeof e === 'string')) throw invalid('emails');
  if (!Number.isInteger(d.recipientCount)) throw invalid('recipientCount');
  if (!Number.isInteger(d.lifetimeDays)) throw invalid('lifetimeDays');
  if (typeof d.origin !== 'string') throw invalid('origin');
  const origin = normalizeUploadOrigin(d.origin);
  if (!origin) throw invalid('origin');
  return {
    files: d.files.map(f => ({ name: f.name, size: f.size, contentType: f.contentType.trim() || 'application/octet-stream' })),
    lifetimeDays: d.lifetimeDays as number,
    externalCount: d.emails.length,
    recipientCount: d.recipientCount as number,
    emails: d.emails,
    origin,
  };
}

/**
 * Quick file transfer, step 1 (spec 1.115): checks the sender's limits, creates the `file-transfers`
 * doc in state 'uploading' and one resumable GCS upload session per file in the private bucket.
 * Each session is bound to its declared size (X-Upload-Content-Length) and to the browser origin.
 * The client PUTs the bytes to `sessionUrl`; `sendFileTransfer` later activates the transfer.
 */
export const prepareFileTransferUpload = onCall(
  { region: 'europe-west6', enforceAppCheck: true, cors: true },
  async (request: CallableRequest<unknown>): Promise<PrepareFileTransferUploadResponse> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const tenantId = await getCallerTenantId(request as never, CF_NAME);
    const uid = request.auth?.uid ?? '';
    const req = parseRequest(request.data);

    // One read of users/{uid}: person link and roles come from the same document.
    const db = getFirestore();
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) throw new HttpsError('permission-denied', 'No user profile.');
    const user = userSnap.data() as Partial<UserModel>;
    const personKey = user.personKey;
    if (!personKey) throw new HttpsError('failed-precondition', 'User profile has no linked person.');
    if (user.roles?.registered !== true || isKioskOnly(user as UserModel)) {
      throw new HttpsError('permission-denied', 'Registered users only.');
    }

    const config = (await db.collection(AppConfigCollection).doc(tenantId).get()).data() as Partial<AppConfig> | undefined;
    const limits = resolveFileTransferLimits(config?.fileTransferLimits, personKey);

    const now = new Date();
    const ref = db.collection(FileTransferCollection).doc();
    const transferKey = ref.id;
    const eventRef = db.collection(FileTransferEventCollection).doc();
    const totalBytes = req.files.reduce((sum, f) => sum + f.size, 0);
    const files: FileTransferFile[] = req.files.map((f, index) => ({
      index, name: f.name, size: f.size, contentType: f.contentType, path: fileTransferFilePath(tenantId, transferKey, index, f.name), uploaded: false,
    }));

    // Query, limit check and create in ONE transaction: the open-bytes read is serializable, so
    // concurrent calls of one sender cannot all pass the check. Single-field query only (no
    // composite index); tenant and state are filtered in code.
    await db.runTransaction(async tx => {
      const mine = await tx.get(db.collection(FileTransferCollection).where('senderKey', '==', personKey));
      const alreadyOpen = openBytes(
        mine.docs.map(d => d.data() as Pick<FileTransferModel, 'state' | 'totalBytes'> & { tenants?: string[] }).filter(t => t.tenants?.includes(tenantId)),
      );
      const rejection = checkFileTransferRequest(
        { totalBytes, fileCount: req.files.length, externalCount: req.externalCount, recipientCount: req.recipientCount, lifetimeDays: req.lifetimeDays, emails: req.emails },
        limits, alreadyOpen,
      );
      if (rejection) throw new HttpsError('failed-precondition', rejection);

      const transfer = new FileTransferModel(tenantId);
      transfer.senderKey = personKey;
      transfer.files = files;
      transfer.totalBytes = totalBytes;
      transfer.createdAt = now.toISOString();
      transfer.expiresAt = computeExpiresAt(now.toISOString(), req.lifetimeDays);
      transfer.state = 'uploading';

      const event = new FileTransferEventModel(tenantId);
      event.transferKey = transferKey;
      event.senderKey = personKey;
      event.type = 'created';
      event.actorKey = personKey;
      event.at = now.toISOString();

      tx.create(ref, stripKey(transfer));
      tx.create(eventRef, stripKey(event));
    });

    // Sessions after the commit; on failure the reservation is released again (best effort).
    let uploads: PrepareFileTransferUploadResponse['uploads'];
    try {
      uploads = await Promise.all(files.map(async f => {
        const [sessionUrl] = await privateBucket().file(f.path).createResumableUpload({
          origin: req.origin,
          // contentLength is sent as X-Upload-Content-Length: GCS then rejects an upload of any other size.
          metadata: { contentType: f.contentType, contentLength: f.size },
        });
        return { index: f.index, sessionUrl, size: f.size };
      }));
    } catch (error) {
      logger.error(`${CF_NAME}: session creation failed for ${transferKey}`, { error: String(error) });
      await Promise.allSettled([ref.delete(), eventRef.delete()]);
      throw error;
    }

    logger.info(`${CF_NAME}: prepared ${transferKey} for tenant ${tenantId}`, { files: files.length, totalBytes });
    return { transferKey, uploads };
  },
);
