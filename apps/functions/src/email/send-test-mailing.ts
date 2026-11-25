// apps/functions/src/email/send-test-mailing.ts
//
// «Testmail senden» (spec 1.176 §8.4): the caller's own unsent mail page as one mail to the caller's own account. The right
// to send is the one of `sendMailing`; the client names no address. Nothing is stored: no mailing, notice, letter, web
// version, push or job, and the page stays a draft. The address is personal data and appears in no log.
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';

import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { isSyntheticLoginEmail } from '@okr/user-util';

import { effectiveSender, getAppEmailConfig, getEmailProvider, isBareAddress } from '../auth/email-templates';
import { type EmailAttachment, sendEmailViaProvider } from '../auth/email-transport';
import { isImpersonated } from '../auth/passkey.decide';
import { composeSample } from './compose-sample';
import { createsWebVersion } from './mail-page/web-version.logic';
import { answerEventLines, assertSendableEvents, mailPageContent, type MailingRequest, parsePageKey, resolveAttachmentBytes, safeFilename } from './mailing';
import { parseCaleventKeys, sendErrorCode } from './personal-mail.logic';
import { EmailTemplateError, type RenderedEmail } from './render-email';
import { asLayoutChoice } from './render-email.logic';
import { assertVersandSender } from './versand-sender';

const REGION = 'europe-west6';
const CF_NAME = 'sendTestMailing';
/** Not `mailing.<key>`: the Mailtrap events of a test mail belong to no Versand (mailing-deliveries, trustedCategory). */
const TEST_CATEGORY = 'test-mailing';
const TEST_SUBJECT = '[Test]';
/** How long the provider may take: half of the function's time, so the caller gets an answer. */
const SEND_TIMEOUT_MS = 60_000;

/** The fields of a send that shape its mail. No recipient: whatever else the request carries is not read. */
export type TestMailingRequest =
  Pick<MailingRequest, 'tenantId' | 'groupKey' | 'layout' | 'from' | 'webVersion' | 'storagePath' | 'filename' | 'extraAttachments' | 'caleventKeys'>
  & { pageKey: string; subject?: string };

export interface TestMailingDeps {
  db: Firestore;
  /** The account itself, from Firebase Auth: the copy of the address in an ID token can be an hour old. */
  account: (uid: string) => Promise<Pick<UserRecord, 'email' | 'emailVerified'>>;
  send: typeof sendEmailViaProvider;
  /** As `resolveAttachmentBytes` takes it. */
  readDocument?: Parameters<typeof resolveAttachmentBytes>[2];
}

export interface TestMailingCaller {
  uid: string;
  /** An admin's session in this account (`createCustomToken`): the mail would go to the member, unasked. */
  impersonated: boolean;
}

/**
 * The one recipient: the address of the caller's account. Refused with `no-address`: no address, the synthetic one of a
 * Benutzername account, and anything but one address. An elevated caller may write to anybody, so their address needs no
 * confirmation, as for every other mail to an account. A group or newsletter admin may reach the group's members only: an
 * account address they changed and never confirmed would be an arbitrary recipient, so theirs must be verified.
 */
async function ownAddress(deps: TestMailingDeps, uid: string, elevated: boolean): Promise<string> {
  const { email, emailVerified } = await deps.account(uid);
  if (!email || isSyntheticLoginEmail(email) || !isBareAddress(email) || (!elevated && emailVerified !== true)) {
    throw new HttpsError('failed-precondition', 'no-address');
  }
  return email;
}

/** `work`, given up after `SEND_TIMEOUT_MS`. */
async function withinTime(work: () => Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const limit = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error('The provider did not answer.'), { code: 'timeout' })), SEND_TIMEOUT_MS);
    });
    await Promise.race([work(), limit]);
  } finally {
    clearTimeout(timer);
  }
}

async function attachmentsOf(data: TestMailingRequest, tenantId: string, readDocument: TestMailingDeps['readDocument']): Promise<EmailAttachment[]> {
  const resolved = await resolveAttachmentBytes(data, tenantId, readDocument);
  return resolved.map((a) => ({ ...a, filename: safeFilename(a.filename) }));
}

/** The test mail of a request: every check, then exactly one mail to the caller. `deps` are its edges. */
export async function runTestMailing(deps: TestMailingDeps, caller: TestMailingCaller, request: unknown): Promise<{ sent: true }> {
  const { db } = deps;
  const { uid } = caller;
  const data = (request ?? {}) as TestMailingRequest;
  const { tenantId, groupKey } = data;
  if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('invalid-argument', 'tenantId is required.');
  const subject: unknown = data.subject ?? '';
  if (typeof subject !== 'string') throw new HttpsError('invalid-argument', 'subject must be a string.');
  const pageKey = parsePageKey(data.pageKey);
  if (!pageKey) throw new HttpsError('invalid-argument', 'pageKey is required.');
  const caleventKeys = parseCaleventKeys(data.caleventKeys);
  const hasEvents = caleventKeys.length > 0;

  const { elevated, newsletterGroupKey } = await assertVersandSender(db, { uid, tenantId, groupKey, hasStoragePath: !!data.storagePath, hasEvents });
  if (caller.impersonated) throw new HttpsError('failed-precondition', 'impersonated');
  const to = await ownAddress(deps, uid, elevated);
  const events = hasEvents ? await assertSendableEvents(db, tenantId, caleventKeys) : [];
  const content = await mailPageContent(tenantId, pageKey, uid);
  const attachments = await attachmentsOf(data, tenantId, deps.readDocument);

  let mail: RenderedEmail;
  try {
    mail = await composeSample(tenantId, {
      content: content.html,
      layout: asLayoutChoice(data.layout),
      attachmentName: attachments.map((a) => a.filename).join(', '),
      answerEvents: answerEventLines(events),
      newsletter: !!newsletterGroupKey,
      webLink: createsWebVersion(typeof data.webVersion === 'boolean' ? data.webVersion : undefined, !!newsletterGroupKey, 1),
    });
  } catch (error) {
    if (error instanceof EmailTemplateError) throw new HttpsError('failed-precondition', error.code);
    logger.error(`${CF_NAME}: the mail could not be composed (tenant ${tenantId}): ${sendErrorCode(error)}`);
    throw new HttpsError('internal', 'The test mail could not be composed.');
  }

  // as a real send: a group admin's mail leaves under the tenant's sender, any other From must be on the tenant's domain
  const from = effectiveSender(elevated ? data.from : '', await getAppEmailConfig(tenantId));
  try {
    const provider = await getEmailProvider(tenantId);
    await withinTime(() => deps.send(provider, {
      from, to: [to], subject: `${TEST_SUBJECT} ${subject.trim()}`.trim(), html: mail.html, text: mail.text, attachments, category: TEST_CATEGORY,
    }));
  } catch (error) {
    // class and status only: a provider's message may quote the address
    logger.error(`${CF_NAME}: the provider did not take the test mail (${sendErrorCode(error)}) (tenant ${tenantId})`);
    throw new HttpsError('unavailable', 'provider');
  }
  logger.info(`${CF_NAME}: test mail of page ${pageKey} sent (tenant ${tenantId})`);
  return { sent: true };
}

export const sendTestMailing = onCall(
  {
    region: REGION, enforceAppCheck: true, cors: true, memory: '512MiB', timeoutSeconds: 120,
    secrets: ['MAILGUN_SMTP_PASSWORD', 'MAILTRAP_APIKEY', 'NETZONE_SMTP_PASSWORD', 'MAILTRAP_TEST_USER', 'MAILTRAP_TEST_PASS'],
  },
  async (request: CallableRequest<unknown>): Promise<{ sent: true }> => {
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    return runTestMailing({
      db: getFirestore(),
      account: (uid) => getAuth().getUser(uid),
      send: sendEmailViaProvider,
    }, { uid: request.auth?.uid ?? '', impersonated: isImpersonated({ impersonatedBy: request.auth?.token['impersonatedBy'] }) }, request.data);
  },
);
