import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { FileTransferCollection, FileTransferEventCollection, FileTransferModel, UserModel } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { fileTransferPrefix } from './file-transfer-storage';

const CF_NAME = 'endFileTransfer';

export type EndAction = 'noop' | 'end' | 'cancelUpload' | 'notOpen';

/**
 * What an end request does with the freshly re-read transfer (pure, decided inside the transaction):
 * - gone / 'ended' / 'expired' → 'noop' (idempotent success)
 * - 'open' → 'end' (sender or admin): state 'ended', files deleted
 * - 'uploading' and the caller is the SENDER → 'cancelUpload': the doc is deleted, so a failed or
 *   aborted upload no longer counts toward the sender's open bytes (admins cannot cancel an upload)
 * - anything else → 'notOpen' (failed-precondition)
 *
 * `uploadingOnly` (the send form's best-effort cleanup after a failure) never ends an 'open'
 * transfer: a send whose response was lost may already have opened and notified it.
 */
export function endAction(fresh: Pick<FileTransferModel, 'state'> | undefined, isSender: boolean, uploadingOnly = false): EndAction {
  if (!fresh || fresh.state === 'ended' || fresh.state === 'expired') return 'noop';
  if (fresh.state === 'open') return uploadingOnly ? 'noop' : 'end';
  if (fresh.state === 'uploading' && isSender) return 'cancelUpload';
  return 'notOpen';
}

/**
 * callable 'endFileTransfer' {transferKey, uploadingOnly?} → {} (spec 1.115 §4.5). The sender or an admin ends an
 * OPEN transfer early: files deleted, state 'ended', endedBy, event 'ended'. The sender may also
 * cancel their own transfer that is still 'uploading' (the send form calls this on every failure
 * after prepare): the doc is deleted and an 'ended' event is logged. Idempotent: an already
 * 'ended'/'expired'/deleted transfer is a no-op success. Foreign tenants get 'not-found'.
 */
export const endFileTransfer = onCall<unknown, Promise<Record<string, never>>>(
  { region: 'europe-west6', enforceAppCheck: true, cors: true },
  async (request) => {
    checkAppCheckToken(request, CF_NAME);
    checkAuthentication(request, CF_NAME);
    const tenantId = await getCallerTenantId(request, CF_NAME);
    const data = request.data as { transferKey?: unknown; uploadingOnly?: unknown } | null;
    const key = data?.transferKey;
    const uploadingOnly = data?.uploadingOnly === true;
    if (typeof key !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(key)) throw new HttpsError('invalid-argument', 'transferKey');

    const db = getFirestore();
    const user = (await db.collection('users').doc(request.auth?.uid ?? '').get()).data() as Partial<UserModel> | undefined;
    const personKey = user?.personKey ?? '';
    const isAdmin = user?.roles?.admin === true;

    const ref = db.collection(FileTransferCollection).doc(key);
    const snap = await ref.get();
    const stored = snap.data() as Partial<FileTransferModel> | undefined;
    if (!snap.exists || !stored?.tenants?.includes(tenantId)) throw new HttpsError('not-found', 'notFound');
    const isSender = !!personKey && stored.senderKey === personKey;
    if (!isAdmin && !isSender) throw new HttpsError('permission-denied', 'Only the sender or an admin may end this transfer.');

    // Decide in a transaction that re-reads the doc, so a concurrent reaper run, send or second end
    // cannot double-write: only a transfer that is STILL 'open' is ended (or STILL 'uploading' is
    // cancelled by its sender), and its event is written in the same commit. Files go after the commit.
    const actor = personKey || `uid:${request.auth?.uid ?? ''}`;
    const ended = await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(ref)).data() as Partial<FileTransferModel> | undefined;
      const action = endAction(fresh as Pick<FileTransferModel, 'state'> | undefined, isSender, uploadingOnly);
      if (action === 'noop') return false;
      if (action === 'notOpen') throw new HttpsError('failed-precondition', 'notOpen');
      if (action === 'cancelUpload') tx.delete(ref);
      else tx.update(ref, { state: 'ended', endedBy: actor });
      tx.set(db.collection(FileTransferEventCollection).doc(), {
        tenants: stored.tenants, transferKey: key, senderKey: stored.senderKey ?? '', type: 'ended',
        recipientId: '', actorKey: actor, fileIndex: -1, at: new Date().toISOString(),
      });
      return true;
    });
    if (ended) {
      // The transfer is already 'ended' (or its upload doc deleted); a failed delete must not fail the call — the hourly
      // orphan sweep (reapFileTransfers) removes the leftover files of an ended transfer.
      try {
        await privateBucket().deleteFiles({ prefix: fileTransferPrefix(tenantId, key) });
      } catch (err) {
        logger.error(`${CF_NAME}: deleting the files of ${key} failed — left to the orphan sweep`, { error: String(err) });
      }
    }
    return {};
  },
);
