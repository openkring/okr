// apps/functions/src/email/mailing-letters.ts
//
// The Post delivery of a Versand (spec 1.145 P3): one PDF with one letter per Post recipient, which the
// sender downloads, prints and posts. No external service — Pingen is 2.144.
//
// Each letter is the tenant's letter template (`templates/mailing-letter_<tenantId>`, a PDF template filled
// with the recipient's address and the editor text) when it has a published one, else a built-in A4 layout:
// the club (the tenant's default org) as sender, the recipient's address in the Swiss window position
// (right window, C5/6 envelope), place and date, subject and the editor text. The PDF attachments follow each letter; other file types go only by E-Mail and In-App.
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
import QRCode from 'qrcode';
import { TemplateCollection, TemplateVersionSubcollection, type NoticeAttachment, type TemplateAssetRef } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';
import { isOrgRecipient, ORG_RECIPIENT_PREFIX, recipientParentKey } from '@okr/shared-util-core';

import { privateBucket } from '../_storage/private-bucket';
import { formatPostalAddress } from '../contract/contract-request.util';
import { getBrowser } from '../pdf/browser-pool';
import { registerHelpers } from '../pdf/handlebars-helpers';
import { resolvePayee } from '../pdf/qr-slip';
import { compileTemplate } from '../pdf/template-cache';
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
  /** the events block below the text (eventsBlockHtml); '' or absent = none */
  eventsHtml?: string;
}

/** An event of the Versand as a letter shows it below the text. */
export interface LetterEvent {
  name: string;
  /** e.g. '01.12.2026, 19:30' */
  when: string;
  location: string;
}

/** Above the QR codes: what the reader does with them. */
export const LETTER_QR_INTRO = 'Scanne den QR-Code, um zu- oder abzusagen.';

/**
 * The events below the letter text, each led by a QR code of the recipient's answer link (`qrSvg`, one SVG for
 * all: the link is per recipient, its page lists every event). Inline styles only, so it also fits into a
 * tenant's letter template; the block and each row avoid a page break.
 */
export function eventsBlockHtml(events: LetterEvent[], qrSvg: string): string {
  if (events.length === 0 || !qrSvg) return '';
  // the generated SVG has only a viewBox: size it to its box
  const svg = qrSvg.replace(/<svg\b/, '<svg width="100%" height="100%"');
  const avoid = 'break-inside:avoid;page-break-inside:avoid;';
  const rows = events.map((e) => {
    const details = [`<strong>${escapeHtml(e.name)}</strong>`, escapeHtml(e.when), escapeHtml(e.location)].filter(Boolean).join('<br>');
    return `<tr style="${avoid}">`
      + `<td style="width:30mm;padding:2mm 4mm 2mm 0;vertical-align:top;"><div style="width:26mm;height:26mm;">${svg}</div></td>`
      + `<td style="padding:2mm 0;vertical-align:top;font-size:10pt;line-height:1.35;">${details}</td></tr>`;
  }).join('');
  return `<div class="okr-letter-events" style="${avoid}margin-top:8mm;">`
    + `<div style="font-size:9pt;margin-bottom:2mm;">${escapeHtml(LETTER_QR_INTRO)}</div>`
    + `<table style="border-collapse:collapse;width:100%;">${rows}</table></div>`;
}

/** Puts the events block at the end of a letter page: before its last </body>, else at the very end. */
export function withEventsBlock(html: string, block: string): string {
  if (!block) return html;
  const at = html.toLowerCase().lastIndexOf('</body>');
  return at < 0 ? html + block : html.slice(0, at) + block + html.slice(at);
}

/** The QR code of one link as an SVG string, without a quiet zone (the block's padding gives it room). */
export async function qrSvgOf(url: string): Promise<string> {
  return QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' });
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
    @page { size: A4; margin: 15mm 0 15mm 0; }
    /* page 1 keeps its top at the paper edge: the window positions below are measured from it */
    @page :first { margin: 0 0 15mm 0; }
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
      ${c.eventsHtml ?? ''}
    </div>
  </body></html>`;
}

/** A postal address formatted for the letter, plus its single fields for a letter template. */
export interface PostalFields {
  street: string;
  zipCity: string;
  streetName: string;
  streetNumber: string;
  zipCode: string;
  city: string;
  countryCode: string;
}

/** The favourite (else the first) postal address of a parent (`person.<okey>` / `org.<okey>`) in the tenant. */
export async function postalOf(db: Firestore, parentKey: string, tenantId: string): Promise<PostalFields | undefined> {
  const snap = await db.collection('addresses').where('parentKey', '==', parentKey).where('addressChannel', '==', 'postal').get();
  const postal = snap.docs.map((d) => d.data())
    .filter((a) => !a['isArchived'] && ((a['tenants'] as string[]) ?? []).includes(tenantId));
  const chosen = postal.find((a) => a['isFavorite'] === true) ?? postal[0];
  const formatted = formatPostalAddress(chosen);
  if (!formatted || !chosen) return undefined;
  const field = (name: string): string => String(chosen[name] ?? '').trim();
  return {
    ...formatted,
    streetName: field('streetName'), streetNumber: field('streetNumber'),
    zipCode: field('zipCode'), city: field('city'), countryCode: field('countryCode') || 'CH',
  };
}

// ---- letter template (spec 1.145 follow-up) ----------------------------------------------------------
//
// A tenant may own a PDF template under the fixed id `mailing-letter_<tenantId>`: each letter is then that
// template, filled with the recipient's address and the editor text (`{{{body}}}`), instead of the built-in
// layout above. Without a usable, published template the built-in layout stays.

export const LETTER_TEMPLATE_KEY = 'mailing-letter';

export function letterTemplateKey(tenantId: string): string {
  return `${LETTER_TEMPLATE_KEY}_${tenantId}`;
}

interface StoredLetterTemplate {
  kind?: string;
  tenants?: string[];
  isArchived?: boolean;
  currentVersion?: number;
}

interface StoredLetterVersion {
  status?: string;
  html?: string;
  css?: string;
  partials?: Record<string, string>;
  assets?: TemplateAssetRef[];
}

export interface LetterTemplate {
  key: string;
  version: number;
  html: string;
  css: string;
}

/**
 * Only the tenant's own (tenants exactly [tenantId]), live PDF template with a published current version, and
 * without partials or assets (those would be per-template state on the shared Handlebars instance).
 */
export function isUsableLetterTemplate(doc: StoredLetterTemplate | undefined, version: StoredLetterVersion | undefined, tenantId: string): boolean {
  if (!doc || !version) return false;
  const tenants = doc.tenants ?? [];
  return (doc.kind ?? 'pdf') === 'pdf' && !doc.isArchived && tenants.length === 1 && tenants[0] === tenantId
    && (doc.currentVersion ?? 0) >= 1 && version.status === 'published' && !!version.html
    && Object.keys(version.partials ?? {}).length === 0 && (version.assets ?? []).length === 0;
}

export async function readLetterTemplate(db: Firestore, tenantId: string): Promise<LetterTemplate | undefined> {
  const key = letterTemplateKey(tenantId);
  const ref = db.collection(TemplateCollection).doc(key);
  const snap = await ref.get();
  if (!snap.exists) return undefined;
  const doc = snap.data() as StoredLetterTemplate;
  const versionNo = doc.currentVersion ?? 0;
  if (versionNo < 1) return undefined;
  const versionSnap = await ref.collection(TemplateVersionSubcollection).doc(String(versionNo)).get();
  const version = versionSnap.exists ? (versionSnap.data() as StoredLetterVersion) : undefined;
  if (!isUsableLetterTemplate(doc, version, tenantId) || !version) {
    logger.warn(`mailing letters: ${key} is not usable (unpublished, archived, foreign, or with partials/assets); using the built-in layout`);
    return undefined;
  }
  return { key, version: versionNo, html: version.html ?? '', css: version.css ?? '' };
}

export interface LetterRecipient extends PostalFields {
  name: string;
  firstName: string;
  lastName: string;
}

/**
 * What a letter template sees (besides `payee.*`, added at render time): the recipient's address as whole
 * lines and as single fields, the sender, the date, the subject and the sanitised editor text as `body`
 * (render it with `{{{body}}}`).
 */
export function letterPayload(args: { recipient: LetterRecipient; sender: LetterParty; date: string; placeAndDate: string; subject: string; body: string }): Record<string, unknown> {
  const { recipient: r } = args;
  return {
    name: r.name, firstName: r.firstName, lastName: r.lastName,
    street: r.street, zipCity: r.zipCity,
    streetName: r.streetName, streetNumber: r.streetNumber, zipCode: r.zipCode, city: r.city, countryCode: r.countryCode,
    sender: args.sender,
    date: args.date,
    placeAndDate: args.placeAndDate,
    subject: args.subject,
    body: args.body,
  };
}

/** 'DD.MM.YYYY' of a day. */
export function letterDate(now: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
}

/**
 * The only origin a template letter may load from: our image CDN (the tenant logos). Fixed, never read from
 * the template, because the template is tenant-editable and the page holds the recipient's address.
 */
export const LETTER_TEMPLATE_ORIGINS: ReadonlySet<string> = new Set(['https://bkaiser.imgix.net']);

/** True for a request the letter page may make: data: URIs, and https URLs of an allowed origin. */
export function isAllowedLetterRequest(url: string, origins: ReadonlySet<string>): boolean {
  if (url.startsWith('data:')) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && origins.has(parsed.origin);
  } catch {
    return false;
  }
}

let helpersRegistered = false;

/**
 * Compiles the template once per Versand. Only the static helpers of `generateDocument` (formatIban, …) are
 * global; partials and `assetUrl` would be per-template state on the shared Handlebars instance, which a
 * parallel run for another tenant could overwrite, so a letter template carries neither (see readLetterTemplate).
 */
async function compileLetter(t: LetterTemplate, payee: unknown): Promise<(payload: Record<string, unknown>) => string> {
  if (!helpersRegistered) {
    await registerHelpers();
    helpersRegistered = true;
  }
  const compiled = await compileTemplate(`${t.key}@${t.version}`, t.html, t.css);
  return (payload) => compiled({ ...payload, payee });
}

async function renderOne(html: string, origins: ReadonlySet<string> = new Set()): Promise<Uint8Array> {
  const page = await (await getBrowser()).newPage();
  try {
    // The body is user HTML and the template tenant-editable: no script, only data: URIs and, for a template
    // letter, the fixed image CDN.
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (req) => { if (isAllowedLetterRequest(req.url(), origins)) void req.continue(); else void req.abort(); });
    // 'load' waits for the images, the template's logo included
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
  /** «QR-Code für Link anzeigen»: the events below each person's letter, with a QR code of `answerUrl(personKey)` */
  answerEvents?: LetterEvent[];
  answerUrl?: (personKey: string) => string;
}): Promise<{ storagePath: string; letters: number; missing: number } | undefined> {
  const { tenantId, mailingKey, personKeys } = args;
  if (personKeys.length === 0) return undefined;
  const db = getFirestore();
  const bucket = privateBucket();

  const orgSnap = await db.collection('orgs').doc(tenantId).get();
  const senderAddress = await postalOf(db, `org.${tenantId}`, tenantId);
  const sender: LetterParty = { name: String(orgSnap.data()?.['name'] ?? ''), street: senderAddress?.street ?? '', zipCity: senderAddress?.zipCity ?? '' };
  const now = new Date();
  const date = placeAndDate(sender.zipCity, now);
  const template = await readLetterTemplate(db, tenantId);
  const letterTemplate = template ? await compileLetter(template, await resolvePayee(db, tenantId)) : undefined;

  const appendix: PDFDocument[] = [];
  for (const a of args.attachments.filter(isPdfAttachment)) {
    const [bytes] = await bucket.file(a.storagePath).download();
    appendix.push(await PDFDocument.load(bytes, { ignoreEncryption: true }));
  }

  const out = await PDFDocument.create();
  let letters = 0;
  let missing = 0;
  // a recipient key is a bare person okey or `org.<okey>` (the comm center reaches both)
  for (const personKey of personKeys) {
    const isOrg = isOrgRecipient(personKey);
    const subjectRef = isOrg
      ? db.collection('orgs').doc(personKey.slice(ORG_RECIPIENT_PREFIX.length))
      : db.collection('persons').doc(personKey);
    const [subjectSnap, address] = await Promise.all([subjectRef.get(), postalOf(db, recipientParentKey(personKey), tenantId)]);
    if (!address) { missing++; continue; }
    const p = subjectSnap.data() ?? {};
    const firstName = isOrg ? '' : String(p['firstName'] ?? '').trim();
    const lastName = isOrg ? '' : String(p['lastName'] ?? '').trim();
    const name = isOrg ? String(p['name'] ?? '').trim() : `${firstName} ${lastName}`.trim();
    // an org cannot answer (an answer records a person's attendance): its letter has no events block
    const eventsHtml = !isOrg && args.answerUrl && args.answerEvents?.length
      ? eventsBlockHtml(args.answerEvents, await qrSvgOf(args.answerUrl(personKey)))
      : '';
    const bytes = letterTemplate
      ? await renderOne(withEventsBlock(letterTemplate(letterPayload({
        recipient: { name, firstName, lastName, ...address }, sender, date: letterDate(now), placeAndDate: date, subject: args.subject, body: args.body,
      })), eventsHtml), LETTER_TEMPLATE_ORIGINS)
      : await renderOne(buildLetterHtml({
        sender, recipient: { name, street: address.street, zipCity: address.zipCity }, placeAndDate: date, subject: args.subject, body: args.body, eventsHtml,
      }));
    const letter = await PDFDocument.load(bytes);
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
