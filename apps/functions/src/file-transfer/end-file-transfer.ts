import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';

import { FileTransferCollection, FileTransferModel, UserModel } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { logFileTransferEvent } from './file-transfer-access';
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
    if (stored.state === 'ended' || stored.state === 'expired') return {};
    if (stored.state !== 'open') throw new HttpsError('failed-precondition', 'notOpen');

    await privateBucket().deleteFiles({ prefix: fileTransferPrefix(tenantId, key) });
    await ref.update({ state: 'ended', endedBy: personKey });
    await logFileTransferEvent(db, {
      tenants: stored.tenants, transferKey: key, senderKey: stored.senderKey ?? '', type: 'ended',
      recipientId: '', actorKey: personKey, fileIndex: -1, at: new Date().toISOString(),
    });
    return {};
  },
);
