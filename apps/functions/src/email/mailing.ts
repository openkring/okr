// apps/functions/src/email/mailing.ts
//
// A Versand (spec 1.145 §10): one send that reaches each recipient on the delivery types ticked in the
// composer's Zustellung table.
//
// `sendMailing` (callable) checks the caller, stores every attachment in the PRIVATE bucket (the default
// bucket is an imgix source, see private-bucket.ts) and writes one `mailings` doc with the Admin SDK.
// `onMailing` (trigger) fans it out, so the send survives a closed modal:
//
//   email → one `mailJobs` doc, the existing throttled sender. The Bcc is read here from
//           `address-directory`, never taken from the client.
//   chat  → one `notices` doc for the recipients with an account in the tenant, and a push that opens it.
//   post  → one PDF with a letter per recipient, for the sender to download (mailing-letters.ts, P3).
//
// Who may send: memberAdmin / privileged / admin of the tenant, or an admin of `groupKey`, who then reaches
// only the group's current members and the tenant's own addresses (the boundary of sendGroupEmail).

import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { DeliveryChannel, type EmailLayoutChoice, NoticeAttachment, NoticeCollection, type NoticeModel } from '@okr/shared-models';
import { DateFormat, getTodayStr, isOrgRecipient, recipientParentKey } from '@okr/shared-util-core';
import { projectID } from 'firebase-functions/params';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { invitationLinkSecret, mailingAnswerFunctionUrl, mailingAnswerUrl } from '../calendar/answer-link';
import { todayStoreDate } from '../calendar/recipients';
import type { AnswerableEvent } from '../calendar/invitation';
import { eventWhen } from '../calendar/mail';
import { privateBucket } from '../_storage/private-bucket';
import { getAppEmailConfig } from '../auth/email-templates';
import { assertCallerIsGroupAdmin } from '../content/group-content.util';
import { sanitizeEmailBody } from '../pdf/sanitize';
import { pushToPersons, selectUserDocs } from '../srv/push';
import { activeMemberKeys, MembershipDoc, unknownRecipients } from './group-mail';
import { htmlToText } from './html-to-text';
import { MailJobCollection, MailJobDoc } from './mail-job';
import { lastEventDate } from './mailing-answer.logic';
import { chunk, isElevated } from './mailing-recipients';
import { MAX_PERSONAL_RECIPIENTS, parseCaleventKeys, personalEntries, refusedEventMessage, sendableEventRefusal } from './personal-mail.logic';
import { asLayoutChoice } from './render-email.logic';
import { buildMailingLetters } from './mailing-letters';
import { mailingCategory } from './mailing-deliveries.logic';

const REGION = 'europe-west6';
export const MailingCollection = 'mailings';
const IN_CHUNK = 30;
const MAX_RECIPIENTS = 3000;
/** The callable carries at most ~10 MB; the email provider caps the whole mail lower still. */
const MAX_ATTACHMENTS_BYTES = 8 * 1024 * 1024;
/**
 * Generated documents a sender may attach by path: only the Versand's own tenant's
 * (`render-document.ts` writes `generated-docs/<tenantId>/<uid>/…` and `generated-docs-ephemeral/<tenantId>/…`).
 */
export function isTenantDocumentPath(path: string, tenantId: string): boolean {
  if (!tenantId || path.includes('..')) return false;
  return path.startsWith(`generated-docs/${tenantId}/`) || path.startsWith(`generated-docs-ephemeral/${tenantId}/`);
}
/** The channels a Versand sends: E-Mail, In-App, and Post as a letter PDF for the sender (P3). */
const SENDABLE: string[] = [DeliveryChannel.Email, DeliveryChannel.Chat, DeliveryChannel.Post];

export interface MailingDelivery {
  personKey: string;
  channels: string[];
}

export interface MailingRequest {
  tenantId: string;
  groupKey?: string;
  subject: string;
  body: string;
  layout?: EmailLayoutChoice;
  from?: string;
  to: string[];
  cc?: string[];
  /** a generated document to attach, by Storage path */
  storagePath?: string;
  filename?: string;
  extraAttachments?: { filename: string; contentBase64: string; contentType?: string }[];
  deliveries: MailingDelivery[];
  /** The events to ask about; each email recipient then gets a personal answer link. Not for group admins. */
  caleventKeys?: string[];
}

/** The `mailings` doc. Written only here; `state` and the counts are owned by `onMailing`. */
export interface MailingDoc {
  tenants: string[];
  senderUid: string;
  senderKey: string;
  senderName: string;
  subject: string;
  body: string;
  layout: EmailLayoutChoice;
  from: string;
  to: string[];
  cc: string[];
  attachmentName: string;
  attachments: NoticeAttachment[];
  deliveries: MailingDelivery[];
  createdAt: string;
  state: 'pending' | 'sent' | 'failed';
  emails?: number;
  notices?: number;
  pushes?: number;
  mailJobKey?: string;
  noticeKey?: string;
  /** the Post part (P3): built by `onMailing`, downloaded through `getMailingLetters` */
  letters?: { state: 'pending' | 'ready' | 'failed'; storagePath?: string; count?: number; missing?: number; error?: string };
  error?: string;
  /** The events a Versand with answer links asks about (calevent keys); absent = no answer links. */
  caleventKeys?: string[];
  /** StoreDate of the last event's last day: the answer links stop working after it. */
  validUntil?: string;
}

/**
 * The deliveries as the server accepts them: each person once, only the channels a Versand sends today.
 * A person without any of them is dropped. Anything that is not the expected shape refuses the send.
 */
export function parseDeliveries(raw: unknown): MailingDelivery[] {
  if (!Array.isArray(raw)) throw new HttpsError('invalid-argument', 'deliveries must be a list.');
  const byKey = new Map<string, Set<string>>();
  for (const item of raw as { personKey?: unknown; channels?: unknown }[]) {
    if (typeof item?.personKey !== 'string' || !item.personKey || !Array.isArray(item.channels)) {
      throw new HttpsError('invalid-argument', 'Each delivery needs a personKey and a channel list.');
    }
    const set = byKey.get(item.personKey) ?? new Set<string>();
    for (const channel of item.channels) if (typeof channel === 'string' && SENDABLE.includes(channel)) set.add(channel);
    byKey.set(item.personKey, set);
  }
  return [...byKey].filter(([, set]) => set.size > 0)
    .map(([personKey, set]) => ({ personKey, channels: SENDABLE.filter((c) => set.has(c)) }));
}

/** The personKeys ticked for one channel. */
export function keysFor(deliveries: MailingDelivery[], channel: string): string[] {
  return deliveries.filter((d) => d.channels.includes(channel)).map((d) => d.personKey);
}

/** A Storage-safe file name: no path, no control characters, at most 120 characters. */
export function safeFilename(name: string): string {
  const last = name.split(/[\\/]/).pop() ?? '';
  const base = [...last].filter((ch) => ch.charCodeAt(0) > 31 && ch.charCodeAt(0) !== 127).join('').trim();
  return (base || 'attachment').slice(0, 120);
}

/** The push text of a notice: the plain body, shortened. */
export function noticeExcerpt(html: string, max = 140): string {
  const text = htmlToText(html).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function stringList(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new HttpsError('invalid-argument', `${field} must be a list of strings.`);
  }
  return value as string[];
}

/** The favorite email per recipient (its `person.<key>` / `org.<key>` directory doc), keyed by the recipient key. */
export async function directoryEmailsByKey(db: Firestore, tenantId: string, personKeys: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (personKeys.length === 0) return out;
  const snaps = await db.getAll(...personKeys.map((key) => db.collection('address-directory').doc(`${tenantId}_${recipientParentKey(key)}`)));
  snaps.forEach((snap, i) => {
    const email = String(snap.data()?.['favEmail'] ?? '');
    if (email) out.set(personKeys[i], email);
  });
  return out;
}

async function directoryEmails(db: Firestore, tenantId: string, parentKeys: string[]): Promise<string[]> {
  if (parentKeys.length === 0) return [];
  const snaps = await db.getAll(...parentKeys.map((key) => db.collection('address-directory').doc(`${tenantId}_${key}`)));
  return snaps.map((snap) => String(snap.data()?.['favEmail'] ?? '')).filter((email) => email.length > 0);
}

/** Copies every attachment into the private bucket and returns where each one lives. */
async function storeAttachments(req: MailingRequest, tenantId: string, mailingKey: string): Promise<NoticeAttachment[]> {
  const bucket = privateBucket();
  const out: NoticeAttachment[] = [];
  let total = 0;
  const store = async (filename: string, content: Buffer, contentType: string) => {
    total += content.length;
    if (total > MAX_ATTACHMENTS_BYTES) throw new HttpsError('invalid-argument', 'The attachments are too large.');
    const storagePath = `mailings/${tenantId}/${mailingKey}/${out.length}-${safeFilename(filename)}`;
    await bucket.file(storagePath).save(content, { contentType, resumable: false });
    out.push({ filename: safeFilename(filename), storagePath, contentType });
  };
  if (req.storagePath) {
    if (!isTenantDocumentPath(req.storagePath, tenantId)) {
      throw new HttpsError('invalid-argument', 'This document cannot be attached.');
    }
    const file = getStorage().bucket().file(req.storagePath);
    const [[content], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
    await store(req.filename || req.storagePath.split('/').pop() || 'document.pdf', content, String(meta.contentType ?? 'application/pdf'));
  }
  for (const att of req.extraAttachments ?? []) {
    if (typeof att?.filename !== 'string' || typeof att.contentBase64 !== 'string') {
      throw new HttpsError('invalid-argument', 'Invalid attachment.');
    }
    await store(att.filename, Buffer.from(att.contentBase64, 'base64'), att.contentType || 'application/octet-stream');
  }
  return out;
}

export const sendMailing = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '512MiB', timeoutSeconds: 120 },
  async (request: CallableRequest<MailingRequest>): Promise<{ mailingKey: string }> => {
    const CF_NAME = 'sendMailing';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const data = request.data ?? ({} as MailingRequest);
    const { tenantId, groupKey } = data;
    if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('invalid-argument', 'tenantId is required.');
    if (typeof data.subject !== 'string' || !data.subject.trim()) throw new HttpsError('invalid-argument', 'subject is required.');
    if (typeof data.body !== 'string') throw new HttpsError('invalid-argument', 'body is required.');
    const to = stringList(data.to, 'to');
    const cc = stringList(data.cc, 'cc');
    const deliveries = parseDeliveries(data.deliveries);
    const caleventKeys = parseCaleventKeys(data.caleventKeys);
    if (deliveries.length === 0) throw new HttpsError('invalid-argument', 'Nobody receives this Versand.');
    if (deliveries.length > MAX_RECIPIENTS) throw new HttpsError('invalid-argument', `At most ${MAX_RECIPIENTS} recipients.`);
    if (keysFor(deliveries, DeliveryChannel.Email).length > 0 && to.length === 0) {
      throw new HttpsError('invalid-argument', 'to must not be empty for an email delivery.');
    }

    if (caleventKeys.length > 0) {
      if (typeof groupKey === 'string' && groupKey) {
        throw new HttpsError('permission-denied', 'A group admin cannot send answer links.');
      }
      // an answer records a person's attendance: an org cannot answer
      if (deliveries.some((d) => isOrgRecipient(d.personKey))) {
        throw new HttpsError('invalid-argument', 'Answer links go to persons only.');
      }
      if (keysFor(deliveries, DeliveryChannel.Email).length > MAX_PERSONAL_RECIPIENTS) {
        throw new HttpsError('invalid-argument', `At most ${MAX_PERSONAL_RECIPIENTS} email recipients with events.`);
      }
    }

    const db = getFirestore();
    const uid = request.auth?.uid ?? '';
    const caller = (await db.collection('users').doc(uid).get()).data() ?? {};
    const elevated = isElevated(caller['roles']) && ((caller['tenants'] ?? []) as string[]).includes(tenantId);
    let from = typeof data.from === 'string' ? data.from : '';
    if (!elevated) {
      if (typeof groupKey !== 'string' || !groupKey) {
        throw new HttpsError('permission-denied', 'This operation requires the memberAdmin or privileged role.');
      }
      await assertCallerIsGroupAdmin(db, uid, tenantId, groupKey, 'Only an admin of the group may send to its members.');
      if (data.storagePath) throw new HttpsError('permission-denied', 'A group admin may only attach files from the device.');
      // the letters carry members' postal addresses, which the address vault keeps from a group admin
      if (keysFor(deliveries, DeliveryChannel.Post).length > 0) {
        throw new HttpsError('permission-denied', 'A group admin cannot send by post.');
      }
      const memberships = await db.collection('memberships').where('orgKey', '==', groupKey).where('orgModelType', '==', 'group').get();
      const members = new Set(activeMemberKeys(memberships.docs.map((doc) => doc.data() as MembershipDoc), tenantId, getTodayStr(DateFormat.StoreDate)));
      if (deliveries.some((d) => !members.has(d.personKey))) {
        throw new HttpsError('permission-denied', 'Every recipient must be a member of the group.');
      }
      const allowed = [
        ...await directoryEmails(db, tenantId, [...members].map((key) => `person.${key}`)),
        ...await directoryEmails(db, tenantId, [`org.${tenantId}`]),
      ];
      if (unknownRecipients([...to, ...cc], allowed).length > 0) {
        throw new HttpsError('permission-denied', 'To and Cc must be addresses of the club or of the group.');
      }
      from = '';                                   // a group admin's Versand leaves under the tenant's sender
    }

    let validUntil: string | undefined;
    if (caleventKeys.length > 0) {
      const today = todayStoreDate();               // Zurich, the same day the answer page judges by
      const snaps = await db.getAll(...caleventKeys.map((key) => db.collection('calevents').doc(key)));
      const events = snaps.map((snap) => snap.data() as AnswerableEvent | undefined);
      for (const event of events) {
        if (sendableEventRefusal(event, tenantId, today)) {
          // the name only when the event belongs to this tenant: another tenant's name must not leak
          const name = event?.tenants?.includes(tenantId) ? event.name : undefined;
          throw new HttpsError('invalid-argument', refusedEventMessage(name));
        }
      }
      validUntil = lastEventDate(events as AnswerableEvent[]);
    }

    const ref = db.collection(MailingCollection).doc();
    const attachments = await storeAttachments(data, tenantId, ref.id);
    const senderKey = String(caller['personKey'] ?? '');
    const doc: MailingDoc = {
      tenants: [tenantId],
      senderUid: uid,
      senderKey,
      senderName: String(caller['displayName'] ?? caller['loginEmail'] ?? ''),
      subject: data.subject.trim(),
      body: data.body,
      layout: asLayoutChoice(data.layout),
      from,
      to,
      cc,
      attachmentName: attachments.map((a) => a.filename).join(', '),
      attachments,
      deliveries,
      createdAt: getTodayStr(DateFormat.StoreDateTime),
      state: 'pending',
      ...(caleventKeys.length > 0 ? { caleventKeys, ...(validUntil ? { validUntil } : {}) } : {}),
      ...(keysFor(deliveries, DeliveryChannel.Post).length > 0 ? { letters: { state: 'pending' as const } } : {}),
    };
    await ref.set(doc);
    logger.info(`${CF_NAME}: Versand ${ref.id} to ${deliveries.length} recipient(s) (tenant ${tenantId})`);
    return { mailingKey: ref.id };
  },
);

/** The stored attachments as private-bucket refs for the mail job: no file content in the job doc (1 MB cap). */
export function privateRefs(attachments: NoticeAttachment[]): MailJobDoc['attachments'] {
  return attachments.map((a) => ({ privatePath: a.storagePath, filename: a.filename, contentType: a.contentType }));
}

/** The personKeys among `keys` that have an account in the tenant: only they can open a notice. */
async function keysWithAccount(db: Firestore, tenantId: string, keys: string[]): Promise<string[]> {
  const found = new Set<string>();
  for (const part of chunk(keys, IN_CHUNK)) {
    const users = await db.collection('users').where('personKey', 'in', part).get();
    const accounts = users.docs.map((d) => ({ uid: d.id, ...d.data() } as { uid: string; personKey?: string; tenants?: string[]; isArchived?: boolean }));
    for (const account of selectUserDocs(accounts, tenantId) as { personKey?: string }[]) found.add(String(account.personKey ?? ''));
  }
  return keys.filter((key) => found.has(key));
}

export const onMailing = onDocumentCreated(
  // 2GiB, 540 s: the Post part renders one letter per recipient in Chromium (as generateDocument does)
  { document: `${MailingCollection}/{mailingKey}`, region: REGION, memory: '2GiB', timeoutSeconds: 540, secrets: [invitationLinkSecret] },
  async (event) => {
    const CF_NAME = 'onMailing';
    const snap = event.data;
    if (!snap) return;
    const mailing = snap.data() as MailingDoc;
    const tenantId = mailing.tenants?.length === 1 ? mailing.tenants[0] : '';
    if (!tenantId) {
      await snap.ref.update({ state: 'failed', error: 'A Versand must name exactly one tenant.' });
      return;
    }
    const db = getFirestore();
    const result: Partial<MailingDoc> = { emails: 0, notices: 0, pushes: 0 };
    try {
      const emailKeys = keysFor(mailing.deliveries, DeliveryChannel.Email);
      if (emailKeys.length > 0) {
        // read only when a job is written: the tenant's sender config is not needed for an empty list
        const base = async (): Promise<MailJobDoc> => ({
          tenants: [tenantId],
          to: mailing.to,
          from: mailing.from || (await getAppEmailConfig(tenantId)).from,
          subject: mailing.subject,
          body: mailing.body,
          layout: mailing.layout,
          attachments: privateRefs(mailing.attachments),
          state: 'pending',
          // every mail of the job carries it, so its Mailtrap events can be told apart (getMailingDeliveries)
          category: mailingCategory(snap.id),
        });
        const attachmentName = mailing.attachmentName ? { attachmentName: mailing.attachmentName } : {};
        if (mailing.caleventKeys?.length) {
          // one mail per person, each with that person's own signed link; no Bcc, no dedupe by address
          const emailByKey = await directoryEmailsByKey(db, tenantId, emailKeys);
          const secret = invitationLinkSecret.value();
          const answerBase = mailingAnswerFunctionUrl(projectID.value());
          const personal = personalEntries(emailKeys, emailByKey, (personKey) => mailingAnswerUrl(answerBase, snap.id, personKey, secret));
          if (personal.length > 0) {
            const eventSnaps = await db.getAll(...mailing.caleventKeys.map((key) => db.collection('calevents').doc(key)));
            const answerEvents = eventSnaps.map((s2) => s2.data() as { name?: string; startDate?: string; startTime?: string } | undefined)
              .filter((e) => !!e).map((e) => ({ name: String(e?.name ?? ''), when: eventWhen(e?.startDate, e?.startTime) }));
            const job: MailJobDoc = { ...(await base()), ...attachmentName, personal, answerEvents };
            result.mailJobKey = (await db.collection(MailJobCollection).add(job)).id;
            result.emails = personal.length;
          }
        } else {
          const bcc = [...new Set(await directoryEmails(db, tenantId, emailKeys.map(recipientParentKey)))];
          if (bcc.length > 0) {
            const job: MailJobDoc = { ...(await base()), cc: mailing.cc, bcc, ...attachmentName };
            result.mailJobKey = (await db.collection(MailJobCollection).add(job)).id;
            result.emails = bcc.length;
          }
        }
      }

      // an org has no account: In-App is for persons only
      const chatKeys = await keysWithAccount(db, tenantId, keysFor(mailing.deliveries, DeliveryChannel.Chat).filter((key) => !isOrgRecipient(key)));
      if (chatKeys.length > 0) {
        const noticeRef = db.collection(NoticeCollection).doc();
        const notice: Omit<NoticeModel, 'okey'> = {
          tenants: [tenantId],
          isArchived: false,
          subject: mailing.subject,
          body: await sanitizeEmailBody(mailing.body),
          attachments: mailing.attachments,
          recipients: chatKeys,
          senderKey: mailing.senderKey,
          senderName: mailing.senderName,
          mailingKey: snap.id,
          caleventKeys: mailing.caleventKeys ?? [],
          sentAt: getTodayStr(DateFormat.StoreDateTime),
        };
        await noticeRef.set(notice);
        result.noticeKey = noticeRef.id;
        result.notices = chatKeys.length;
        try {
          const pushed = await pushToPersons(chatKeys, {
            type: 'notice', tenantId, title: mailing.subject, body: noticeExcerpt(notice.body),
            url: `/notice/${noticeRef.id}`, channelId: `notice-${noticeRef.id}`,
          }, CF_NAME);
          result.pushes = pushed.sent;
        } catch (err) {
          // the notice is on the dashboard either way; a failed push is not a failed Versand
          logger.warn(`${CF_NAME}: push for notice ${noticeRef.id} failed:`, err);
        }
      }
      // Post last: the slowest part, and its failure must not undo the mails and notices already out
      const postKeys = keysFor(mailing.deliveries, DeliveryChannel.Post);
      if (postKeys.length > 0) {
        try {
          const built = await buildMailingLetters({
            tenantId, mailingKey: snap.id, personKeys: postKeys,
            subject: mailing.subject, body: await sanitizeEmailBody(mailing.body), attachments: mailing.attachments,
          });
          result.letters = built?.storagePath
            ? { state: 'ready', storagePath: built.storagePath, count: built.letters, missing: built.missing }
            : { state: 'failed', count: 0, missing: built?.missing ?? postKeys.length, error: 'No recipient has a postal address.' };
        } catch (err) {
          logger.error(`${CF_NAME}: letters for Versand ${snap.id} failed:`, err);
          result.letters = { state: 'failed', error: err instanceof Error ? err.message : String(err) };
        }
      }
      await snap.ref.update({ ...result, state: 'sent' });
      logger.info(`${CF_NAME}: Versand ${snap.id}: ${result.emails} email(s), ${result.notices} notice recipient(s), ${result.pushes} push(es)`);
    } catch (err) {
      logger.error(`${CF_NAME}: Versand ${snap.id} failed:`, err);
      await snap.ref.update({ ...result, state: 'failed', error: err instanceof Error ? err.message : String(err) });
    }
  },
);
