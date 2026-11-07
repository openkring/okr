// apps/functions/src/email/mailing-letters.ts
//
// The Post delivery of a Versand (spec 1.145 P3): one PDF with one letter per Post recipient, which the
// sender downloads, prints and posts. No external service — Pingen is 2.144.
//
// Each letter is a built-in A4 layout: the club (the tenant's default org) as sender, the recipient's
// address in the Swiss window position (right window, C5/6 envelope), place and date, subject and the
// editor text. The PDF attachments follow each letter; other file types go only by E-Mail and In-App.
// Every letter is rendered on its own, so a long text never shifts the attachments onto the next
// recipient's pages.
//
// The file holds postal addresses: it lives in the private bucket under `mailing-letters/`, is handed out
// only through `getMailingLetters` (a signed URL for the sender or memberAdmin / privileged), and the
// nightly `mailingLettersReap` deletes it after 7 days.

import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { PDFDocument } from 'pdf-lib';
import type { NoticeAttachment } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { privateBucket } from '../_storage/private-bucket';
import { formatPostalAddress } from '../contract/contract-request.util';
import { getBrowser } from '../pdf/browser-pool';
import { isElevated } from './mailing-recipients';

const REGION = 'europe-west6';
export const LETTERS_PREFIX = 'mailing-letters/';
/** How long the letters wait for their download. */
export const LETTERS_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const URL_LIFETIME_MS = 10 * 60 * 1000;

export interface LetterParty {
  name: string;
  street: string;
  zipCity: string;
}

export interface LetterContent {
  sender: LetterParty;
  recipient: LetterParty;
  /** e.g. 'Zürich, 7.11.2026' */
  placeAndDate: string;
  subject: string;
  /** sanitised HTML */
  body: string;
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function lettersPath(tenantId: string, mailingKey: string): string {
  return `${LETTERS_PREFIX}${tenantId}/${mailingKey}.pdf`;
}

/** Only PDF files can be appended to a letter. */
export function isPdfAttachment(a: Pick<NoticeAttachment, 'filename' | 'contentType'>): boolean {
  return a.contentType === 'application/pdf' || a.filename.toLowerCase().endsWith('.pdf');
}

/** 'Zürich, 7.11.2026' — the sender's city (without the zip) and the day of the send. */
export function placeAndDate(senderZipCity: string, now: Date): string {
  const city = senderZipCity.replace(/^\d{4,5}\s+/, '').trim();
  const date = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}`;
  return city ? `${city}, ${date}` : date;
}

/**
 * One letter as HTML, A4 with no page margin: every position in mm. The address sits where a Swiss
 * right-window envelope shows it (left 118 mm, top 52 mm), with the sender's return line above it.
 */
export function buildLetterHtml(c: LetterContent): string {
  const lines = (p: LetterParty) => [p.name, p.street, p.zipCity].filter(Boolean).map(escapeHtml).join('<br>');
  const returnLine = [c.sender.name, c.sender.street, c.sender.zipCity].filter(Boolean).map(escapeHtml).join(', ');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; font-family: Helvetica, Arial, sans-serif; font-size: 11pt; color: #000; }
    .sender { position: absolute; left: 20mm; top: 15mm; font-size: 9pt; line-height: 1.35; }
    .window { position: absolute; left: 118mm; top: 52mm; width: 80mm; }
    .return { font-size: 7pt; border-bottom: 0.3pt solid #000; padding-bottom: 1mm; margin-bottom: 2mm; }
    .address { line-height: 1.35; }
    .content { margin: 105mm 20mm 20mm 20mm; }
    .date { margin-bottom: 10mm; }
    .subject { font-weight: bold; margin-bottom: 6mm; }
    .body p { margin: 0 0 3mm; }
  </style></head><body>
    <div class="sender">${lines(c.sender)}</div>
    <div class="window"><div class="return">${returnLine}</div><div class="address">${lines(c.recipient)}</div></div>
    <div class="content">
      <div class="date">${escapeHtml(c.placeAndDate)}</div>
      <div class="subject">${escapeHtml(c.subject)}</div>
      <div class="body">${c.body}</div>
    </div>
  </body></html>`;
}

/** The favourite (else the first) postal address of a parent (`person.<okey>` / `org.<okey>`) in the tenant. */
export async function postalOf(db: Firestore, parentKey: string, tenantId: string): Promise<{ street: string; zipCity: string } | undefined> {
  const snap = await db.collection('addresses').where('parentKey', '==', parentKey).where('addressChannel', '==', 'postal').get();
  const postal = snap.docs.map((d) => d.data())
    .filter((a) => !a['isArchived'] && ((a['tenants'] as string[]) ?? []).includes(tenantId));
  return formatPostalAddress(postal.find((a) => a['isFavorite'] === true) ?? postal[0]);
}

async function renderOne(html: string): Promise<Uint8Array> {
  const page = await (await getBrowser()).newPage();
  try {
    // The letter is built here from data, but the body is user HTML: no network at all, only data: URIs.
    await page.setRequestInterception(true);
    page.on('request', (req) => { if (req.url().startsWith('data:')) void req.continue(); else void req.abort(); });
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } });
  } finally {
    await page.close();
  }
}

/**
 * Builds the letters of one Versand into the private bucket and returns how many there are. A recipient
 * without a postal address (removed since the send) is skipped and counted in `missing`.
 */
export async function buildMailingLetters(args: {
  tenantId: string;
  mailingKey: string;
  personKeys: string[];
  subject: string;
  body: string;
  attachments: NoticeAttachment[];
}): Promise<{ storagePath: string; letters: number; missing: number } | undefined> {
  const { tenantId, mailingKey, personKeys } = args;
  if (personKeys.length === 0) return undefined;
  const db = getFirestore();
  const bucket = privateBucket();

  const orgSnap = await db.collection('orgs').doc(tenantId).get();
  const senderAddress = await postalOf(db, `org.${tenantId}`, tenantId);
  const sender: LetterParty = { name: String(orgSnap.data()?.['name'] ?? ''), street: senderAddress?.street ?? '', zipCity: senderAddress?.zipCity ?? '' };
  const date = placeAndDate(sender.zipCity, new Date());

  const appendix: PDFDocument[] = [];
  for (const a of args.attachments.filter(isPdfAttachment)) {
    const [bytes] = await bucket.file(a.storagePath).download();
    appendix.push(await PDFDocument.load(bytes, { ignoreEncryption: true }));
  }

  const out = await PDFDocument.create();
  let letters = 0;
  let missing = 0;
  for (const personKey of personKeys) {
    const [personSnap, address] = await Promise.all([db.collection('persons').doc(personKey).get(), postalOf(db, `person.${personKey}`, tenantId)]);
    if (!address) { missing++; continue; }
    const p = personSnap.data() ?? {};
    const name = `${String(p['firstName'] ?? '')} ${String(p['lastName'] ?? '')}`.trim();
    const letter = await PDFDocument.load(await renderOne(buildLetterHtml({
      sender, recipient: { name, ...address }, placeAndDate: date, subject: args.subject, body: args.body,
    })));
    for (const doc of [letter, ...appendix]) {
      const pages = await out.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => out.addPage(page));
    }
    letters++;
  }
  if (letters === 0) return { storagePath: '', letters, missing };
  const storagePath = lettersPath(tenantId, mailingKey);
  await bucket.file(storagePath).save(Buffer.from(await out.save()), { contentType: 'application/pdf', resumable: false });
  return { storagePath, letters, missing };
}

interface MailingLettersDoc {
  tenants?: string[];
  senderUid?: string;
  letters?: { state?: 'pending' | 'ready' | 'failed'; storagePath?: string; count?: number; missing?: number; error?: string };
}

/** Who may download the letters: the sender, or memberAdmin / privileged of the tenant. */
export function mayGetLetters(mailing: MailingLettersDoc, uid: string, caller: { tenants?: string[]; roles?: unknown }): boolean {
  const tenant = mailing.tenants?.[0] ?? '';
  return (!!uid && mailing.senderUid === uid)
    || (!!tenant && (caller.tenants ?? []).includes(tenant) && isElevated(caller.roles));
}

/**
 * The state of a Versand's letters, and while they are ready a 10-minute download URL. The composer
 * asks again until the state is no longer `pending`.
 */
export const getMailingLetters = onCall(
  { region: REGION, enforceAppCheck: true, cors: true },
  async (request: CallableRequest<{ mailingKey: string }>): Promise<{ state: string; url?: string; count?: number; missing?: number }> => {
    const CF_NAME = 'getMailingLetters';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const mailingKey = request.data?.mailingKey;
    if (typeof mailingKey !== 'string' || !mailingKey) throw new HttpsError('invalid-argument', 'mailingKey is required.');
    const db = getFirestore();
    const uid = request.auth?.uid ?? '';
    const [mailingSnap, callerSnap] = await Promise.all([db.collection('mailings').doc(mailingKey).get(), db.collection('users').doc(uid).get()]);
    const mailing = mailingSnap.data() as MailingLettersDoc | undefined;
    if (!mailing || !mayGetLetters(mailing, uid, (callerSnap.data() ?? {}) as { tenants?: string[]; roles?: unknown })) {
      throw new HttpsError('permission-denied', 'These letters are not available.');
    }
    const letters = mailing.letters;
    if (!letters) return { state: 'none' };
    if (letters.state !== 'ready' || !letters.storagePath) return { state: letters.state ?? 'pending', count: letters.count, missing: letters.missing };
    const file = privateBucket().file(letters.storagePath);
    const [exists] = await file.exists();
    if (!exists) return { state: 'expired' };
    const [url] = await file.getSignedUrl({
      version: 'v4', action: 'read', expires: Date.now() + URL_LIFETIME_MS,
      responseDisposition: 'attachment; filename="Briefe.pdf"',
    });
    return { state: 'ready', url, count: letters.count, missing: letters.missing };
  },
);

/** Whether a Storage object is a letters file older than 7 days. Nothing outside `mailing-letters/` ever is. */
export function isReapableLetters(name: string, timeCreated: string | undefined, nowMs: number, maxAgeMs = LETTERS_MAX_AGE_MS): boolean {
  if (!name.startsWith(LETTERS_PREFIX)) return false;
  const createdMs = new Date(timeCreated ?? 0).getTime();
  if (!Number.isFinite(createdMs) || createdMs <= 0) return false;
  return nowMs - createdMs > maxAgeMs;
}

/** Nightly: deletes letters files after 7 days — they hold postal addresses and were meant for one download. */
export async function runMailingLettersReap(): Promise<void> {
  const [files] = await privateBucket().getFiles({ prefix: LETTERS_PREFIX });
  const now = Date.now();
  let deleted = 0;
  for (const f of files) {
    if (isReapableLetters(f.name, f.metadata.timeCreated, now)) {
      await f.delete();
      deleted++;
    }
  }
  logger.info(`mailingLettersReap: deleted ${deleted} letters file(s)`);
}
