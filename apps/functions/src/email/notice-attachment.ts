// apps/functions/src/email/notice-attachment.ts
//
// Opens a file of a Mitteilung (spec 1.145 §10). The files live in the private bucket, which no client
// can read; this callable checks that the caller may read the notice — a recipient, or memberAdmin /
// privileged / admin of its tenant (the rule on `notices`) — and returns a short-lived signed URL.

import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { NoticeCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { isElevated } from './mailing-recipients';

const REGION = 'europe-west6';
const CF_NAME = 'getNoticeAttachment';
const URL_LIFETIME_MS = 10 * 60 * 1000;

interface NoticeDoc {
  tenants?: string[];
  recipients?: string[];
  attachments?: { filename: string; storagePath: string; contentType?: string }[];
}

interface CallerDoc {
  personKey?: string;
  tenants?: string[];
  roles?: unknown;
}

/** The same decision as the `notices` read rule. */
export function mayReadNotice(notice: NoticeDoc, caller: CallerDoc): boolean {
  const tenant = notice.tenants?.[0] ?? '';
  const inTenant = !!tenant && (caller.tenants ?? []).includes(tenant);
  const isRecipient = !!caller.personKey && (notice.recipients ?? []).includes(caller.personKey);
  return isRecipient || (inTenant && isElevated(caller.roles));
}

export const getNoticeAttachment = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ noticeKey: string; filename: string }>): Promise<{ url: string }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const { noticeKey, filename } = request.data ?? {};
    if (typeof noticeKey !== 'string' || !noticeKey || typeof filename !== 'string' || !filename) {
      throw new HttpsError('invalid-argument', 'noticeKey and filename are required.');
    }
    const db = getFirestore();
    const [noticeSnap, callerSnap] = await Promise.all([
      db.collection(NoticeCollection).doc(noticeKey).get(),
      db.collection('users').doc(request.auth?.uid ?? '').get(),
    ]);
    const notice = noticeSnap.data() as NoticeDoc | undefined;
    // one answer for «missing» and «not yours», so the callable reveals nothing about other notices
    if (!notice || !mayReadNotice(notice, (callerSnap.data() ?? {}) as CallerDoc)) {
      throw new HttpsError('permission-denied', 'This notice is not available.');
    }
    const attachment = (notice.attachments ?? []).find((a) => a.filename === filename);
    if (!attachment) throw new HttpsError('not-found', 'No such attachment.');
    const [url] = await privateBucket().file(attachment.storagePath).getSignedUrl({
      version: 'v4', action: 'read', expires: Date.now() + URL_LIFETIME_MS,
      responseDisposition: `attachment; filename="${attachment.filename.replace(/"/g, '')}"`,
    });
    return { url };
  },
);
