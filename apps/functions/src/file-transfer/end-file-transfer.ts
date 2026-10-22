import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { FileTransferCollection, FileTransferEventCollection, FileTransferModel, UserModel } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { fileTransferPrefix } from './file-transfer-storage';

const CF_NAME = 'endFileTransfer';

/**
 * callable 'endFileTransfer' {transferKey} → {} (spec 1.115 §4.5). The sender or an admin ends an
 * OPEN transfer early: files deleted, state 'ended', endedBy, event 'ended'. Idempotent: an already
 * 'ended'/'expired' transfer is a no-op success. Foreign tenants get 'not-found'.
 */
export const endFileTransfer = onCall<unknown, Promise<Record<string, never>>>(
  { region: 'europe-west6', enforceAppCheck: true, cors: true },
  async (request) => {
    checkAppCheckToken(request, CF_NAME);
    checkAuthentication(request, CF_NAME);
    const tenantId = await getCallerTenantId(request, CF_NAME);
    const key = (request.data as { transferKey?: unknown } | null)?.transferKey;
    if (typeof key !== 'string' || !/^[A-Za-z0-9]{1,64}$/.test(key)) throw new HttpsError('invalid-argument', 'transferKey');

    const db = getFirestore();
    const user = (await db.collection('users').doc(request.auth?.uid ?? '').get()).data() as Partial<UserModel> | undefined;
    const personKey = user?.personKey ?? '';
    const isAdmin = user?.roles?.admin === true;

    const ref = db.collection(FileTransferCollection).doc(key);
    const snap = await ref.get();
    const stored = snap.data() as Partial<FileTransferModel> | undefined;
    if (!snap.exists || !stored?.tenants?.includes(tenantId)) throw new HttpsError('not-found', 'notFound');
    if (!isAdmin && !(personKey && stored.senderKey === personKey)) throw new HttpsError('permission-denied', 'Only the sender or an admin may end this transfer.');

    // Flip the state in a transaction that re-reads the doc, so a concurrent reaper run (or a
    // second end) cannot double-write: only a transfer that is STILL 'open' is ended, and its
    // event is written in the same commit. The files go after the commit.
    const actor = personKey || `uid:${request.auth?.uid ?? ''}`;
    const ended = await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(ref)).data() as Partial<FileTransferModel> | undefined;
      if (!fresh || fresh.state === 'ended' || fresh.state === 'expired') return false;
      if (fresh.state !== 'open') throw new HttpsError('failed-precondition', 'notOpen');
      tx.update(ref, { state: 'ended', endedBy: actor });
      tx.set(db.collection(FileTransferEventCollection).doc(), {
        tenants: stored.tenants, transferKey: key, senderKey: stored.senderKey ?? '', type: 'ended',
        recipientId: '', actorKey: actor, fileIndex: -1, at: new Date().toISOString(),
      });
      return true;
    });
    if (ended) {
      // The transfer is already 'ended'; a failed delete must not fail the call — the hourly
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
