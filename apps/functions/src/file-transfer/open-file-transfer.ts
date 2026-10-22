import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';

import { FileTransferCollection, FileTransferModel, UserModel } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication, getCallerTenantId } from '@okr/shared-util-functions';
import { FileTransferView } from '@okr/content-file-transfer-util';

import {
  effectiveDisposition, FileDisposition, issueFileUrl, logFileTransferEvent, memberEvent, memberFileAccess, toFileTransferView,
} from './file-transfer-access';

/**
 * Logged-in member access to a quick file transfer (spec 1.115 §4.2): the links in the push and
 * the group-room card open `/private/file-transfer/<transferKey>`, which uses these callables.
 * Members skip the password; who counts as a member is decided by `memberFileAccess` (sender,
 * tenant admin, or person recipient — never an email-only recipient).
 */

const KEY_RE = /^[A-Za-z0-9]{1,64}$/;

interface Member { transfer: FileTransferModel; personKey: string; recipientId: string }

function parseKey(data: unknown): string {
  const key = (data as { transferKey?: unknown } | null)?.transferKey;
  if (typeof key !== 'string' || !KEY_RE.test(key)) throw new HttpsError('invalid-argument', 'transferKey');
  return key;
}

/** Caller, transfer and membership; throws not-found / failed-precondition('expired'). */
async function resolveMember(request: CallableRequest<unknown>, cfName: string, transferKey: string): Promise<Member> {
  checkAppCheckToken(request, cfName);
  checkAuthentication(request, cfName);
  const tenantId = await getCallerTenantId(request, cfName);
  const db = getFirestore();
  const user = (await db.collection('users').doc(request.auth?.uid ?? '').get()).data() as Partial<UserModel> | undefined;
  const personKey = user?.personKey ?? '';

  const snap = await db.collection(FileTransferCollection).doc(transferKey).get();
  if (!snap.exists) throw new HttpsError('not-found', 'notFound');
  // defaults only fill fields a legacy doc lacks; never the caller's tenant (tenants decides access)
  const transfer = { ...new FileTransferModel(''), ...(snap.data() as Partial<FileTransferModel>), okey: transferKey } as FileTransferModel;

  const access = memberFileAccess(transfer, { personKey, isAdmin: user?.roles?.admin === true, tenantId }, new Date().toISOString());
  if (!access.ok) {
    if (access.failure === 'expired') throw new HttpsError('failed-precondition', 'expired');
    throw new HttpsError('not-found', 'notFound');
  }
  return { transfer, personKey, recipientId: access.recipientId };
}

/** callable 'getFileTransfer' {transferKey} → FileTransferView (needsPassword is always false for members) */
export const getFileTransfer = onCall<unknown, Promise<FileTransferView>>(
  { region: 'europe-west6', enforceAppCheck: true, cors: true },
  async (request) => {
    const { transfer } = await resolveMember(request, 'getFileTransfer', parseKey(request.data));
    return toFileTransferView(transfer, false);
  },
);

/** callable 'openFileTransferFile' {transferKey, fileIndex, disposition} → {url}; logs opened/downloaded with actorKey */
export const openFileTransferFile = onCall<unknown, Promise<{ url: string }>>(
  { region: 'europe-west6', enforceAppCheck: true, cors: true },
  async (request) => {
    const CF_NAME = 'openFileTransferFile';
    const transferKey = parseKey(request.data);
    const d = (request.data ?? {}) as { fileIndex?: unknown; disposition?: unknown };
    if (d.disposition !== 'inline' && d.disposition !== 'attachment') throw new HttpsError('invalid-argument', 'disposition');
    const { transfer, personKey, recipientId } = await resolveMember(request, CF_NAME, transferKey);
    const file = Number.isInteger(d.fileIndex) ? transfer.files.find(f => f.index === d.fileIndex) : undefined;
    if (!file) throw new HttpsError('invalid-argument', 'fileIndex');

    const disposition: FileDisposition = effectiveDisposition(file.contentType, d.disposition);
    const url = await issueFileUrl(transfer, file.index, disposition);
    await logFileTransferEvent(getFirestore(), memberEvent(transfer, disposition, recipientId, personKey, file.index, new Date().toISOString()));
    logger.info(`${CF_NAME}: ${disposition} file ${file.index} of ${transferKey}`);
    return { url };
  },
);
