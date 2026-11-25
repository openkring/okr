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
// A `household.<okey>` delivery (spec 1.168 §6.3) is resolved here, never taken from the client: E-Mail and
// In-App reach the household's contact as a person, Post sends one letter named after the household to the
// contact's address. A group admin's household keys are dropped (household-recipient.logic.ts).
//
// Who may send: memberAdmin / privileged / admin of the tenant, or an admin of `groupKey`, who then reaches
// only the group's current members and the tenant's own addresses (the boundary of sendGroupEmail).
//
// A newsletter send (spec 1.169 §5.6): `groupKey` names a newsletter group. The server decides that, for every
// caller: it stamps `newsletterGroupKey` and refuses any recipient without an active subscription, so a send to
// a newsletter can never reach a non-subscriber nor go out without the personal unsubscribe link (§5.4).
//
// A page with blocks (spec 1.176 §9): the mail, the letter and the Mitteilung are rendered from one read of the page by
// `sendMailing`. `body` holds the mail; letter and Mitteilung stand in `mailings/{key}/content/sent`, which is written with
// the mailing and read by `onMailing`. Server only, and not on the mailing, which the Versand list downloads whole.

import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { DeliveryChannel, type EmailLayoutChoice, MailingWebCollection, MailPageCollection, type MailPageModel, NoticeAttachment, NoticeCollection, type NoticeModel, type PostOptions } from '@okr/shared-models';
import { DateFormat, getEventLocationName, getTodayStr, isOrgRecipient, recipientParentKey } from '@okr/shared-util-core';
import { projectID } from 'firebase-functions/params';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { invitationLinkSecret, mailingAnswerFunctionUrl, mailingAnswerUrl } from '../calendar/answer-link';
import { todayStoreDate } from '../calendar/recipients';
import type { AnswerableEvent } from '../calendar/invitation';
import { eventWhen } from '../calendar/mail';
import { privateBucket } from '../_storage/private-bucket';
import { effectiveSender, getAppEmailConfig } from '../auth/email-templates';
import { sanitizeEmailBody } from '../pdf/sanitize';
import { pushToPersons, selectUserDocs } from '../srv/push';
import { activeMemberKeys, MembershipDoc, unknownRecipients } from './group-mail';
import { htmlToText } from './html-to-text';
import { MailJobCollection, MailJobDoc } from './mail-job';
import { lastEventDate } from './mailing-answer.logic';
import { chunk } from './mailing-recipients';
import { chunkPersonal, MAX_PERSONAL_RECIPIENTS, parseCaleventKeys, PersonalBlock, personalEntries, refusedEventMessage, sendableEventRefusal } from './personal-mail.logic';
import { newsletterFunctionUrl, newsletterUnsubscribeUrl } from '../newsletter/newsletter-link';
import { activeSubscriberKeys } from '../newsletter/subscribers';
import { asLayoutChoice } from './render-email.logic';
import { EmailTemplateError, renderEmail } from './render-email';
import { renderMailPage } from './mail-page/mail-page';
import { fitsDocuments, letterBodyOf, sentContentOf, type MailContent, type SentContent } from './mail-page/mail-content';
import { MailPageError } from './mail-page/render-mail-page.logic';
import { createsWebVersion, mailingWebFunctionUrl, newWebToken, WEB_LINK_LABEL, webVersionUrl, withWebLink } from './mail-page/web-version.logic';
import { checkLetterImages, LetterPictureError } from './letter-images';
import { buildMailingLetters, countLetterPages, LetterEvent } from './mailing-letters';
import { addressParentKeyOf, contactKeysFor, dropHouseholdKeys, householdFieldsOf, householdInNewsletter, householdsDroppedForAnswers, householdsDroppedForNewsletter, householdWithAnswers, type HouseholdRecipient, loadHouseholdRecipients, postKeysFor } from './household-recipient.logic';
import { mailingCategory } from './mailing-deliveries.logic';
import { noticeSenderOf } from './notice-sender.logic';
import { lettersResult, makePostFanOut, postFanOutDeps } from './mailing-sendings';
import { assertVersandSender } from './versand-sender';
import { getCreditPort } from '../pingen/credit-port';
import '../pingen/credit-binding'; // binds the port: each function loads only its own modules
import { answerEventsOf, type MailingPost, type PostLock, type PostOrderDoc, PostOrderCollection, parsePostRequest, postMailingKey, quoteTokenSecret, readCountryCodes, type QuoteEnv, withPostOrder } from '../pingen/post-order';

const REGION = 'europe-west6';
export const MailingCollection = 'mailings';
/** `mailings/{key}/content/sent` (SentContent): only of a Versand whose page has blocks. */
export const MailingContentSubcollection = 'content';
export const SENT_CONTENT_KEY = 'sent';
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
  /** a bare person okey, `org.<okey>` or `household.<okey>` (resolved by onMailing, spec 1.168) */
  personKey: string;
  channels: string[];
}

export interface MailingRequest {
  tenantId: string;
  groupKey?: string;
  subject: string;
  /** The content HTML of an old client; ignored when `pageKey` is given (the server renders the page). */
  body?: string;
  /** The mail page (spec 1.172) whose sections are the content; absent = the `body` path of old clients. */
  pageKey?: string;
  /** «Webversion»: absent = on for a newsletter, off otherwise (`webVersionOn`). Only with `pageKey`. */
  webVersion?: boolean;
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
  /** «Anzeige im Dashboard»: the E-Mail recipients with an account also get the notice (without a push). */
  dashboard?: boolean;
  /** «QR-Code für Link anzeigen»: each letter ends with the events, each with a QR code of the answer link. */
  letterQrCodes?: boolean;
  /** «Per Pingen senden»: the quote the sender saw; the server recomputes it and takes the price from the credit. */
  post?: { via: 'pingen'; options: PostOptions; token: string; issuedAt: number };
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
  /** A newsletter send splits its mails into jobs of at most MAX_PERSONAL_RECIPIENTS: all of them (`mailJobKey` is the first). */
  mailJobKeys?: string[];
  noticeKey?: string;
  /** the Post part (P3): built by `onMailing`, downloaded through `getMailingLetters` */
  letters?: { state: 'none' | 'pending' | 'ready' | 'failed'; storagePath?: string; count?: number; missing?: number; error?: string };
  error?: string;
  /** The events a Versand with answer links asks about (calevent keys); absent = no answer links. */
  caleventKeys?: string[];
  /** StoreDate of the last event's last day: the answer links stop working after it. */
  validUntil?: string;
  /** The E-Mail recipients with an account also find the Versand on their dashboard (a notice, no push). */
  dashboard?: boolean;
  /** The letters carry the events with a QR code of the answer link; the Post recipients may then answer too. */
  letterQrCodes?: boolean;
  /** An accepted Pingen order (credit deducted); absent = the Post part is the download. */
  post?: MailingPost;
  /**
   * Written by `onMailing`: each `household.<okey>` delivery and the contact it went to (a personKey, no address).
   * The contact answers the events through the household's link (mayAnswer).
   */
  householdContacts?: Record<string, string>;
  /** Written by `onMailing`: each resolved `household.<okey>` delivery and its name, for the Versand overview. */
  householdNames?: Record<string, string>;
  /** A newsletter send (spec 1.169 §5.6): the newsletter group. Set only by `sendMailing`, never taken from the client. */
  newsletterGroupKey?: string;
  /** The mail page whose rendered sections are `body` (spec 1.172); absent on old sends. */
  pageKey?: string;
  /** Whether this send has a web version; set with `pageKey` only. */
  webVersion?: boolean;
  /** The id of its `mailingWeb` snapshot; only the E-Mails link to it. Deleted when the web version is turned off. */
  webToken?: string;
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

/**
 * The favorite email per recipient (its `person.<key>` / `org.<key>` directory doc), keyed by the recipient key.
 * A `household.<okey>` key reads its contact's doc when `households` resolves it, and is left out otherwise.
 */
export async function directoryEmailsByKey(
  db: Firestore, tenantId: string, keys: string[], households: Map<string, HouseholdRecipient> = new Map(),
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const parentOf = (key: string): string | undefined => addressParentKeyOf(key, households);
  const personKeys = keys.filter((key) => parentOf(key) !== undefined);
  if (personKeys.length === 0) return out;
  const snaps = await db.getAll(...personKeys.map((key) => db.collection('address-directory').doc(`${tenantId}_${parentOf(key)}`)));
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

/** An attachment of a Versand request as bytes: what both the quote and the send read. */
export interface ResolvedAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

/** The attachment fields of a Versand request. */
export type MailingAttachmentFields = Pick<MailingRequest, 'storagePath' | 'filename' | 'extraAttachments'>;

/**
 * Reads the request's attachments into memory: a tenant document from the default bucket (checked by
 * `isTenantDocumentPath`), then the inline ones. Nothing is stored. `readDocument` is injectable for tests.
 */
export async function resolveAttachmentBytes(
  req: MailingAttachmentFields,
  tenantId: string,
  readDocument: (path: string) => Promise<{ content: Buffer; contentType: string }> = async (path) => {
    const file = getStorage().bucket().file(path);
    const [[content], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
    return { content, contentType: String(meta.contentType ?? 'application/pdf') };
  },
): Promise<ResolvedAttachment[]> {
  const out: ResolvedAttachment[] = [];
  let total = 0;
  const add = (filename: string, content: Buffer, contentType: string) => {
    total += content.length;
    if (total > MAX_ATTACHMENTS_BYTES) throw new HttpsError('invalid-argument', 'The attachments are too large.');
    out.push({ filename, content, contentType });
  };
  if (req.storagePath) {
    if (!isTenantDocumentPath(req.storagePath, tenantId)) {
      throw new HttpsError('invalid-argument', 'This document cannot be attached.');
    }
    const doc = await readDocument(req.storagePath);
    add(req.filename || req.storagePath.split('/').pop() || 'document.pdf', doc.content, doc.contentType);
  }
  for (const att of req.extraAttachments ?? []) {
    if (typeof att?.filename !== 'string' || typeof att.contentBase64 !== 'string') {
      throw new HttpsError('invalid-argument', 'Invalid attachment.');
    }
    add(att.filename, Buffer.from(att.contentBase64, 'base64'), att.contentType || 'application/octet-stream');
  }
  return out;
}

/** Copies every attachment into the private bucket and returns where each one lives. */
async function storeAttachments(resolved: ResolvedAttachment[], tenantId: string, mailingKey: string): Promise<NoticeAttachment[]> {
  const bucket = privateBucket();
  const out: NoticeAttachment[] = [];
  for (const att of resolved) {
    const storagePath = `mailings/${tenantId}/${mailingKey}/${out.length}-${safeFilename(att.filename)}`;
    await bucket.file(storagePath).save(att.content, { contentType: att.contentType, resumable: false });
    out.push({ filename: safeFilename(att.filename), storagePath, contentType: att.contentType });
  }
  return out;
}

/** The `post-orders/{key}` lock of a Pingen send (Admin SDK only, see firestore.rules). */
function postLockOf(db: Firestore, key: string, tenantId: string): PostLock {
  const lockRef = db.collection(PostOrderCollection).doc(key);
  return {
    acquire: async ({ letters, pages }) => {
      const now = new Date();
      const doc: PostOrderDoc = { tenantId, state: 'pending', createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(), letters, pages };
      try {
        await lockRef.create(doc);
        return { acquired: true as const };
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        if (code !== 6 && code !== 'already-exists') throw error;
        const state = (await lockRef.get()).data()?.['state'];
        return { acquired: false as const, state: state === 'done' || state === 'failed' ? state : 'pending' };
      }
    },
    set: async (state) => { await lockRef.update({ state }); },
    remove: async () => { await lockRef.delete(); },
  };
}

/** After a failed send: drops the files stored for it, unless the mailing doc exists (then they are its files). Never throws. */
async function removeStoredAttachments(ref: FirebaseFirestore.DocumentReference, tenantId: string): Promise<void> {
  try {
    if ((await ref.get()).exists) return;
    await privateBucket().deleteFiles({ prefix: `mailings/${tenantId}/${ref.id}/` });
  } catch (error) {
    logger.warn(`sendMailing: could not remove the files of the failed Versand ${ref.id}`, { error: String((error as Error)?.message ?? error) });
  }
}

/**
 * The recipient rules of a newsletter send (spec 1.169 §5.6); the caller was checked by `assertVersandSender`, which also
 * decided that this is one. Every subscriber gets their own mail, so a Cc is refused (`invalid-argument`), and every
 * recipient must hold an active subscription, also for an elevated caller; a newsletter group admin (no memberships: a
 * newsletter has none) sends no Post, and To only to the subscribers' or the club's addresses.
 */
export async function newsletterSendCheck(db: Firestore, args: {
  tenantId: string; groupKey: string; elevated: boolean; deliveries: MailingDelivery[]; to: string[]; cc: string[];
}): Promise<void> {
  const { tenantId, groupKey, elevated, deliveries } = args;
  // one mail per subscriber (with their own unsubscribe link): a Cc would be dropped, so it is refused
  if (args.cc.length > 0) throw new HttpsError('invalid-argument', 'A newsletter send has no Cc: every subscriber gets their own mail.');
  // the letters carry postal addresses, which the address vault keeps from a group admin
  if (!elevated && keysFor(deliveries, DeliveryChannel.Post).length > 0) throw new HttpsError('permission-denied', 'A group admin cannot send by post.');
  // never combined per household (§6.4): every subscriber gets their own mail with their own unsubscribe link
  if (householdInNewsletter(deliveries, groupKey)) {
    logger.warn(`sendMailing: newsletter send addresses a household (tenant ${tenantId}, group ${groupKey}) — refused`);
    throw new HttpsError('invalid-argument', 'newsletter-household');
  }
  const subscribers = await activeSubscriberKeys(db, tenantId, groupKey);
  if (deliveries.some((d) => !subscribers.has(d.personKey))) {
    throw new HttpsError('permission-denied', 'Every recipient must be a subscriber of the newsletter.');
  }
  if (!elevated) {
    const allowed = [
      ...await directoryEmails(db, tenantId, [...subscribers].map((key) => `person.${key}`)),
      ...await directoryEmails(db, tenantId, [`org.${tenantId}`]),
    ];
    if (unknownRecipients(args.to, allowed).length > 0) {
      throw new HttpsError('permission-denied', 'To must be an address of the club or of the newsletter.');
    }
  }
}

/** The events of a Versand with answer links; one that cannot be answered any more refuses the send. */
export async function assertSendableEvents(db: Firestore, tenantId: string, caleventKeys: string[]): Promise<AnswerableEvent[]> {
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
  return events as AnswerableEvent[];
}

/** The pricing environment of a Pingen send: the same functions the quote uses. */
function postEnv(): QuoteEnv {
  return { getPort: getCreditPort, secret: quoteTokenSecret.value(), now: Date.now(), readCountryCodes, answerEventsOf, renderPages: countLetterPages };
}

/** A page key as the server accepts it: absent, or one document id. */
export function parsePageKey(raw: unknown): string | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw !== 'string' || raw.includes('/')) throw new HttpsError('invalid-argument', 'pageKey must be a document id.');
  return raw;
}

/**
 * The content of the caller's unsent mail page; a page that cannot be sent is a clear refusal, never a raw 500. The refusal
 * names the block at fault in its details, when there is one.
 */
export async function mailPageContent(tenantId: string, pageKey: string, uid: string): Promise<MailContent & { page: MailPageModel }> {
  try {
    return await renderMailPage(tenantId, pageKey, uid);
  } catch (error) {
    if (error instanceof MailPageError) {
      throw new HttpsError('failed-precondition', error.code, error.blockId === undefined ? undefined : { blockId: error.blockId });
    }
    logger.error(`mail page ${pageKey} could not be rendered (tenant ${tenantId})`, { error: String((error as Error)?.message ?? error) });
    throw new HttpsError('internal', 'The mail page could not be rendered.');
  }
}

/** The web version's HTML: the body in the chosen layout, with no personal values (no variables, no answer or unsubscribe link). */
async function webSnapshotHtml(tenantId: string, layout: EmailLayoutChoice, body: string): Promise<string> {
  try {
    return (await renderEmail({ tenantId, layout, body, includeContact: true })).html;
  } catch (error) {
    if (error instanceof EmailTemplateError) throw new HttpsError('failed-precondition', error.code);
    logger.error(`sendMailing: web version could not be rendered (tenant ${tenantId})`, { error: String((error as Error)?.message ?? error) });
    throw new HttpsError('internal', 'The web version could not be rendered.');
  }
}

/** Refuses a letter with a picture that can never be embedded (of another host, or too many). Fetches nothing. */
function assertLetterPictures(letterHtml: string, tenantId: string): void {
  try {
    checkLetterImages(letterHtml);
  } catch (error) {
    if (!(error instanceof LetterPictureError)) throw error;
    logger.warn(`sendMailing: letters refused (tenant ${tenantId}): ${error.message}`);
    throw new HttpsError('failed-precondition', 'letter-picture');
  }
}

function sentContentRef(mailingRef: FirebaseFirestore.DocumentReference): FirebaseFirestore.DocumentReference {
  return mailingRef.collection(MailingContentSubcollection).doc(SENT_CONTENT_KEY);
}

/**
 * What `sendMailing` stored for a Versand whose page has blocks; undefined for a page without blocks and for a Versand
 * without a page. It was written in the transaction of the mailing, so a missing document means «none». A read that fails or
 * a document of another shape throws: printing `body` instead would give letters of another length than the priced ones.
 */
async function readSentContent(mailingRef: FirebaseFirestore.DocumentReference, mailing: MailingDoc): Promise<SentContent | undefined> {
  if (!mailing.pageKey) return undefined;
  const snap = await sentContentRef(mailingRef).get();
  if (!snap.exists) return undefined;
  const sent = snap.data() as Partial<SentContent>;
  if (typeof sent.letterBody !== 'string' || !Array.isArray(sent.noticeBlocks)) throw new Error('The stored content of the Versand is not readable.');
  return { letterBody: sent.letterBody, noticeBlocks: sent.noticeBlocks };
}

/**
 * The writes of a page send, all or nothing: the `mailings` doc, its `content/sent`, its `mailingWeb` snapshot, and on the
 * page the `mailingKey` with the subject, layout and web version it was sent with. A page already sent (a second click, a
 * second tab) refuses the whole send, so one page never becomes two Versände, and no snapshot ever points to a mailing
 * that was not stored.
 */
async function createPageMailing(
  db: Firestore, ref: FirebaseFirestore.DocumentReference, doc: MailingDoc, pageKey: string,
  sent: SentContent | undefined, web: { token: string; html: string } | undefined,
): Promise<void> {
  const pageRef = db.collection(MailPageCollection).doc(pageKey);
  await db.runTransaction(async (tx) => {
    const page = await tx.get(pageRef);
    if (!page.exists) throw new HttpsError('failed-precondition', 'not-found');
    if (page.get('mailingKey')) throw new HttpsError('failed-precondition', 'sent');
    tx.create(ref, doc);
    if (sent) tx.create(sentContentRef(ref), sent);
    if (web) {
      tx.create(db.collection(MailingWebCollection).doc(web.token), { tenants: doc.tenants, mailingKey: ref.id, html: web.html, createdAt: doc.createdAt });
    }
    tx.update(pageRef, { mailingKey: ref.id, subject: doc.subject, layout: doc.layout, webVersion: doc.webVersion === true });
  });
}

export const sendMailing = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '2GiB', timeoutSeconds: 120, secrets: [quoteTokenSecret] },
  async (request: CallableRequest<MailingRequest>): Promise<{ mailingKey: string }> => {
    const CF_NAME = 'sendMailing';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const data = request.data ?? ({} as MailingRequest);
    const { tenantId, groupKey } = data;
    if (typeof tenantId !== 'string' || !tenantId) throw new HttpsError('invalid-argument', 'tenantId is required.');
    if (typeof data.subject !== 'string' || !data.subject.trim()) throw new HttpsError('invalid-argument', 'subject is required.');
    // with a page the server renders the content (spec 1.172); without one, the body of an old client as today
    const pageKey = parsePageKey(data.pageKey);
    if (!pageKey && typeof data.body !== 'string') throw new HttpsError('invalid-argument', 'body is required.');
    const to = stringList(data.to, 'to');
    const cc = stringList(data.cc, 'cc');
    let deliveries = parseDeliveries(data.deliveries);
    const postRequest = parsePostRequest(data.post);
    const caleventKeys = parseCaleventKeys(data.caleventKeys);
    if (deliveries.length === 0) throw new HttpsError('invalid-argument', 'Nobody receives this Versand.');
    if (deliveries.length > MAX_RECIPIENTS) throw new HttpsError('invalid-argument', `At most ${MAX_RECIPIENTS} recipients.`);
    if (keysFor(deliveries, DeliveryChannel.Email).length > 0 && to.length === 0) {
      throw new HttpsError('invalid-argument', 'to must not be empty for an email delivery.');
    }

    if (caleventKeys.length > 0) {
      // an answer records a person's attendance: an org cannot answer
      if (deliveries.some((d) => isOrgRecipient(d.personKey))) {
        throw new HttpsError('invalid-argument', 'Answer links go to persons only.');
      }
      // an answer through a household would count for its contact only (ruling 15): the composer combines nothing
      // when events are chosen, so a household key here comes from an old or crafted client
      if (householdWithAnswers(deliveries, caleventKeys)) {
        logger.warn(`${CF_NAME}: Versand with events addresses a household (tenant ${tenantId}) — refused`);
        throw new HttpsError('invalid-argument', 'household-with-answers');
      }
    }

    const db = getFirestore();
    const uid = request.auth?.uid ?? '';
    // the caller, and whether this is a newsletter send, decided here for every caller; whatever the client sent as
    // `newsletterGroupKey` is never read
    const { elevated, newsletterGroupKey, caller } = await assertVersandSender(db, {
      uid, tenantId, groupKey, hasStoragePath: !!data.storagePath, hasEvents: caleventKeys.length > 0,
    });
    // a group admin's Versand leaves under the tenant's sender
    const from = elevated && typeof data.from === 'string' ? data.from : '';
    if (!elevated) {
      // a group admin addresses no household (householdsForCaller gives them none): drop, never send
      deliveries = dropHouseholdKeys(deliveries, `sendMailing, tenant ${tenantId}, group ${String(groupKey ?? '')}`);
      if (deliveries.length === 0) throw new HttpsError('invalid-argument', 'Nobody receives this Versand.');
    }
    // a newsletter send splits its personal mails into several jobs, so it has no cap of MAX_PERSONAL_RECIPIENTS
    if (caleventKeys.length > 0 && !newsletterGroupKey && keysFor(deliveries, DeliveryChannel.Email).length > MAX_PERSONAL_RECIPIENTS) {
      throw new HttpsError('invalid-argument', `At most ${MAX_PERSONAL_RECIPIENTS} email recipients with events.`);
    }
    if (newsletterGroupKey) {
      await newsletterSendCheck(db, { tenantId, groupKey: newsletterGroupKey, elevated, deliveries, to, cc });
    } else if (!elevated) {
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
    }

    const validUntil = caleventKeys.length > 0 ? lastEventDate(await assertSendableEvents(db, tenantId, caleventKeys)) : undefined;

    // QR codes only where they lead somewhere: letters to print and events to answer
    const letterQrCodes = data.letterQrCodes === true && caleventKeys.length > 0 && keysFor(deliveries, DeliveryChannel.Post).length > 0;
    // a Pingen send is idempotent: the quote token names the Versand, so a replay finds it instead of charging again
    const ref = postRequest ? db.collection(MailingCollection).doc(postMailingKey(tenantId, postRequest.token)) : db.collection(MailingCollection).doc();
    const layout = asLayoutChoice(data.layout);
    let body = typeof data.body === 'string' ? data.body : '';
    let letterBody = body;
    let sent: SentContent | undefined;
    let web: { token: string; html: string } | undefined;
    if (pageKey) {
      // a Pingen replay of a page that this very Versand already sent: the duplicate it is, never a refusal
      if (postRequest && (await db.collection(MailPageCollection).doc(pageKey).get()).get('mailingKey') === ref.id) {
        return { mailingKey: ref.id };
      }
      // rendered after every other check and before any money moves or file is stored
      const content = await mailPageContent(tenantId, pageKey, uid);
      body = content.html;
      letterBody = letterBodyOf(content);
      sent = sentContentOf(content);
      const emails = keysFor(deliveries, DeliveryChannel.Email).length;
      const answer = caleventKeys.length > 0;
      // only with blocks: a page without them is sent as before
      if (sent && !fitsDocuments(body, {
        deliveries, postKeys: postRequest ? keysFor(deliveries, DeliveryChannel.Post) : [],
        ...(emails > 0 && (answer || newsletterGroupKey) ? { personal: { entries: emails, answer, unsubscribe: !!newsletterGroupKey } } : {}),
      })) {
        throw new HttpsError('failed-precondition', 'too-large');
      }
      // a picture no letter can hold: refused here, not after the mails are out
      if (sent && keysFor(deliveries, DeliveryChannel.Post).length > 0) assertLetterPictures(await sanitizeEmailBody(letterBody), tenantId);
      // newsletter or not is the server's decision above (newsletterGroupKey), never the client's; only the
      // E-Mails carry the link, so a send without any E-Mail delivery stores no web version
      const requested = typeof data.webVersion === 'boolean' ? data.webVersion : undefined;
      if (createsWebVersion(requested, !!newsletterGroupKey, emails)) {
        web = { token: newWebToken(), html: await webSnapshotHtml(tenantId, layout, body) };
      }
    }
    const resolved = await resolveAttachmentBytes(data, tenantId);
    const senderKey = String(caller['personKey'] ?? '');
    const build = async (post: MailingPost | undefined): Promise<void> => {
      let attachments: NoticeAttachment[];
      try {
        attachments = await storeAttachments(resolved, tenantId, ref.id);
        const doc: MailingDoc = {
          tenants: [tenantId],
          senderUid: uid,
          senderKey,
          senderName: String(caller['displayName'] ?? caller['loginEmail'] ?? ''),
          subject: data.subject.trim(),
          body,
          layout,
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
          ...(data.dashboard === true ? { dashboard: true } : {}),
          ...(letterQrCodes ? { letterQrCodes: true } : {}),
          ...(post ? { post } : {}),
          ...(newsletterGroupKey ? { newsletterGroupKey } : {}),
          ...(pageKey ? { pageKey, webVersion: !!web } : {}),
          ...(web ? { webToken: web.token } : {}),
        };
        if (pageKey) await createPageMailing(db, ref, doc, pageKey, sent, web);
        else await ref.create(doc);
      } catch (error) {
        await removeStoredAttachments(ref, tenantId);
        throw error;
      }
    };
    if (postRequest) {
      // the actor of the credit entry is the caller's uid
      await withPostOrder(postEnv(), {
        // subject and QR flag exactly as the quote saw them (the token hashes the request, not the stored doc)
        // a page send prices the rendered page: the HTML the letters print
        post: postRequest, tenantId, subject: data.subject, body: letterBody, attachments: resolved, letterQrCodes: data.letterQrCodes === true,
        caleventKeys, postKeys: keysFor(deliveries, DeliveryChannel.Post), ...(newsletterGroupKey ? { newsletterGroupKey } : {}), ...(sent ? { embedImages: true } : {}), mailingKey: ref.id, mailingExists: async () => (await ref.get()).exists, lock: postLockOf(db, ref.id, tenantId), actor: uid,
        caller: caller as { roles?: unknown; tenants?: string[] }, nowIso: getTodayStr(DateFormat.StoreDateTime),
      }, build);
    } else {
      await build(undefined);
    }
    logger.info(`${CF_NAME}: Versand ${ref.id} to ${deliveries.length} recipient(s) (tenant ${tenantId})`);
    return { mailingKey: ref.id };
  },
);

/** The events for the letters' QR block and the signed answer link per recipient (the one the mail would carry). */
async function letterAnswers(db: Firestore, mailingKey: string, caleventKeys: string[]): Promise<{ answerEvents: LetterEvent[]; answerUrl: (personKey: string) => string }> {
  const snaps = await db.getAll(...caleventKeys.map((key) => db.collection('calevents').doc(key)));
  const answerEvents = snaps
    .map((s) => s.data() as ({ name?: string; startDate?: string; startTime?: string } & Parameters<typeof getEventLocationName>[0]) | undefined)
    .filter((e) => !!e)
    .map((e) => ({ name: String(e?.name ?? ''), when: eventWhen(e?.startDate, e?.startTime), location: getEventLocationName(e) }));
  const secret = invitationLinkSecret.value();
  const answerBase = mailingAnswerFunctionUrl(projectID.value());
  return { answerEvents, answerUrl: (personKey) => mailingAnswerUrl(answerBase, mailingKey, personKey, secret) };
}

/** The stored attachments as private-bucket refs for the mail job: no file content in the job doc (1 MB cap). */
export function privateRefs(attachments: NoticeAttachment[]): MailJobDoc['attachments'] {
  return attachments.map((a) => ({ privatePath: a.storagePath, filename: a.filename, contentType: a.contentType }));
}

/** The events of a Versand as its mails list them above the answer button. */
export async function mailAnswerEvents(db: Firestore, caleventKeys: string[]): Promise<{ name: string; when: string }[]> {
  const eventSnaps = await db.getAll(...caleventKeys.map((key) => db.collection('calevents').doc(key)));
  return eventSnaps.map((s2) => s2.data() as { name?: string; startDate?: string; startTime?: string } | undefined)
    .filter((e) => !!e).map((e) => ({ name: String(e?.name ?? ''), when: eventWhen(e?.startDate, e?.startTime) }));
}

/** The signed answer link of one recipient of a Versand. */
function mailAnswerUrlOf(mailingKey: string): (personKey: string) => string {
  const secret = invitationLinkSecret.value();
  const answerBase = mailingAnswerFunctionUrl(projectID.value());
  return (personKey) => mailingAnswerUrl(answerBase, mailingKey, personKey, secret);
}

/** The signed unsubscribe link of one subscriber of a newsletter send; undefined while the link secret is missing. */
function newsletterUnsubscribeUrlOf(groupKey: string): ((personKey: string) => string) | undefined {
  const secret = invitationLinkSecret.value();
  if (!secret) return undefined;
  const base = newsletterFunctionUrl(projectID.value(), 'newsletterUnsubscribe');
  return (personKey) => newsletterUnsubscribeUrl(base, personKey, groupKey, secret);
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

/** The public link of a Versand's web version: the mailingWeb function's own URL with the token. */
function webLinkOf(token: string): string {
  return webVersionUrl(mailingWebFunctionUrl(projectID.value()), token);
}

export const onMailing = onDocumentCreated(
  // 2GiB, 540 s: the Post part renders one letter per recipient in Chromium (as generateDocument does)
  { document: `${MailingCollection}/{mailingKey}`, region: REGION, memory: '2GiB', timeoutSeconds: 540, secrets: [invitationLinkSecret] },
  async (event) => {
    const CF_NAME = 'onMailing';
    const snap = event.data;
    if (!snap) return;
    const mailing = snap.data() as MailingDoc;
    // with events, households are never combined (ruling 15; sendMailing refuses it): drop any household key
    mailing.deliveries = householdsDroppedForAnswers(mailing.deliveries ?? [], mailing.caleventKeys, `mailing ${snap.id}`);
    // a newsletter send is never combined per household (spec 1.169 §6.4; sendMailing refuses it): drop any household key
    mailing.deliveries = householdsDroppedForNewsletter(mailing.deliveries, mailing.newsletterGroupKey, `mailing ${snap.id}`);
    const tenantId = mailing.tenants?.length === 1 ? mailing.tenants[0] : '';
    if (!tenantId) {
      await snap.ref.update({ state: 'failed', error: 'A Versand must name exactly one tenant.' });
      return;
    }
    const db = getFirestore();
    const result: Partial<MailingDoc> = { emails: 0, notices: 0, pushes: 0 };
    const newsletterGroupKey = typeof mailing.newsletterGroupKey === 'string' ? mailing.newsletterGroupKey : '';
    // a newsletter send never goes out without its unsubscribe links: no secret, nothing sent on any channel
    const unsubscribeUrl = newsletterGroupKey ? newsletterUnsubscribeUrlOf(newsletterGroupKey) : undefined;
    if (newsletterGroupKey && !unsubscribeUrl) {
      logger.error(`${CF_NAME}: Versand ${snap.id} is a newsletter send, but the link secret is missing; nothing sent`);
      await snap.ref.update({ ...result, state: 'failed', error: 'The unsubscribe links cannot be signed.' });
      return;
    }
    try {
      // every household key is resolved here (live, this tenant, contact a member); the others are dropped and logged
      const households = await loadHouseholdRecipients(db, tenantId, mailing.deliveries.map((d) => d.personKey), `mailing ${snap.id}`);
      // written at once, before any mail or notice exists: an answer link clicked early (or a run that times out
      // in the Post part) must still find the contact (mayAnswer); kept in `result` for the final update too
      const householdFields = householdFieldsOf(households);
      if (households.size > 0) {
        await snap.ref.update(householdFields);
        Object.assign(result, householdFields);
      }
      // read before anything is sent: a Versand whose content cannot be read fails whole, never half
      const sent = await readSentContent(snap.ref, mailing).catch((err: unknown) => {
        // no letter will be built: the composer must not wait for one
        if (mailing.letters) result.letters = { state: 'failed', error: err instanceof Error ? err.message : String(err) };
        throw err;
      });
      // E-Mail and In-App reach a household's contact as a person, each person once
      const emailKeys = contactKeysFor(mailing.deliveries, DeliveryChannel.Email, households);
      if (emailKeys.length > 0) {
        // read only when a job is written: the tenant's sender config is not needed for an empty list
        // «Im Browser ansehen» goes into the E-Mails only: the notice and the letters keep `mailing.body`
        const base = async (): Promise<MailJobDoc> => ({
          tenants: [tenantId],
          to: mailing.to,
          from: mailing.from || (await getAppEmailConfig(tenantId)).from,
          subject: mailing.subject,
          body: mailing.webToken ? withWebLink(mailing.body, webLinkOf(mailing.webToken), WEB_LINK_LABEL) : mailing.body,
          layout: mailing.layout,
          attachments: privateRefs(mailing.attachments),
          state: 'pending',
          // every mail of the job carries it, so its Mailtrap events can be told apart (getMailingDeliveries)
          category: mailingCategory(snap.id),
        });
        const attachmentName = mailing.attachmentName ? { attachmentName: mailing.attachmentName } : {};
        if (unsubscribeUrl) {
          // a newsletter: one mail per subscriber with their own unsubscribe link and headers (and answer link with
          // events), in jobs of at most MAX_PERSONAL_RECIPIENTS
          const emailByKey = await directoryEmailsByKey(db, tenantId, emailKeys);
          const events = mailing.caleventKeys?.length ? await mailAnswerEvents(db, mailing.caleventKeys) : undefined;
          const answerUrl = events ? mailAnswerUrlOf(snap.id) : undefined;
          const personal = personalEntries(emailKeys, emailByKey, answerUrl, unsubscribeUrl);
          const blocks: PersonalBlock[] = events ? ['answer', 'unsubscribe'] : ['unsubscribe'];
          const keys: string[] = [];
          const parts = chunkPersonal(personal);
          const shared = parts.length > 0 ? await base() : undefined;
          for (const part of parts) {
            const job: MailJobDoc = { ...(shared as MailJobDoc), ...attachmentName, personal: part, blocks, ...(events ? { answerEvents: events } : {}) };
            keys.push((await db.collection(MailJobCollection).add(job)).id);
          }
          if (keys.length > 0) {
            result.mailJobKey = keys[0];
            result.mailJobKeys = keys;
            result.emails = personal.length;
          }
        } else if (mailing.caleventKeys?.length) {
          // one mail per person, each with that person's own signed link; no Bcc, no dedupe by address
          const emailByKey = await directoryEmailsByKey(db, tenantId, emailKeys);
          const secret = invitationLinkSecret.value();
          const answerBase = mailingAnswerFunctionUrl(projectID.value());
          const personal = personalEntries(emailKeys, emailByKey, (personKey) => mailingAnswerUrl(answerBase, snap.id, personKey, secret));
          if (personal.length > 0) {
            const answerEvents = await mailAnswerEvents(db, mailing.caleventKeys);
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
      const chatKeys = await keysWithAccount(db, tenantId, contactKeysFor(mailing.deliveries, DeliveryChannel.Chat, households).filter((key) => !isOrgRecipient(key)));
      // «Anzeige im Dashboard»: the E-Mail recipients with an account get the notice too, but no push (the mail reached them)
      const dashboardKeys = mailing.dashboard
        ? (await keysWithAccount(db, tenantId, emailKeys.filter((key) => !isOrgRecipient(key)))).filter((key) => !chatKeys.includes(key))
        : [];
      const noticeKeys = [...chatKeys, ...dashboardKeys];
      if (noticeKeys.length > 0) {
        const noticeRef = db.collection(NoticeCollection).doc();
        const notice: Omit<NoticeModel, 'okey'> = {
          tenants: [tenantId],
          isArchived: false,
          subject: mailing.subject,
          body: await sanitizeEmailBody(mailing.body),
          ...(sent ? { blocks: sent.noticeBlocks } : {}),
          attachments: mailing.attachments,
          recipients: noticeKeys,
          senderKey: mailing.senderKey,
          // the From address the Versand left under, not the person who sent it; checked like the mail
          // job checks it (mail-job.ts), so an off-domain From shows the tenant's sender the mail really used
          senderName: noticeSenderOf(effectiveSender(mailing.from, await getAppEmailConfig(tenantId))),
          mailingKey: snap.id,
          caleventKeys: mailing.caleventKeys ?? [],
          newsletterGroupKey,
          sentAt: getTodayStr(DateFormat.StoreDateTime),
        };
        await noticeRef.set(notice);
        result.noticeKey = noticeRef.id;
        result.notices = noticeKeys.length;
        if (chatKeys.length > 0) {
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
      }
      // Post last: the slowest part, and its failure must not undo the mails and notices already out
      // a household keeps its key: one letter named after it, to the contact's address
      const postKeys = postKeysFor(mailing.deliveries, households);
      if (postKeys.length > 0) {
        const letterBody = sent?.letterBody ?? mailing.body;
        // a Pingen send (spec 1.150): the charged Swiss letters become `sendings` records, the download holds the abroad ones
        const fanOut = mailing.post?.via === 'pingen'
          ? makePostFanOut({ tenantId, mailingKey: snap.id, post: mailing.post, nowIso: new Date().toISOString(), deps: postFanOutDeps() })
          : undefined;
        try {
          const built = await buildMailingLetters({
            tenantId, mailingKey: snap.id, personKeys: postKeys, households,
            subject: mailing.subject, body: await sanitizeEmailBody(letterBody), attachments: mailing.attachments,
            ...(sent ? { embedImages: true } : {}),
            ...(mailing.letterQrCodes && mailing.caleventKeys?.length ? await letterAnswers(db, snap.id, mailing.caleventKeys) : {}),
            ...(unsubscribeUrl ? { unsubscribeUrl } : {}),
            ...(fanOut ? { onLetter: fanOut.onLetter, only: fanOut.only } : {}),
          });
          await fanOut?.finish();
          result.letters = fanOut?.invalid
            ? { state: 'failed', error: 'The accepted total does not divide into whole letter prices; no letter was queued.' }
            : lettersResult(built, postKeys.length, !!fanOut);
        } catch (err) {
          logger.error(`${CF_NAME}: letters for Versand ${snap.id} failed:`, err);
          // no retry: a charged recipient without a record will never get a letter, so give the share back
          await fanOut?.finish('the letters could not be built');
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
