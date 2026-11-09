// apps/functions/src/pingen/quote.ts
//
// What the sender sees before sending a Versand by post (spec 1.150): letters, pages, the price taken later
// from the tenant's prepaid credit, and a signed token that `sendMailing` verifies, so the price the sender
// agreed to is the price that is deducted for exactly this draft and these recipients.
//
// Privacy: postal addresses are read only for their country code; only counts leave the server.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_POST_OPTIONS, type PostOptions } from '@okr/shared-models';
import { isSwissAddress } from '@okr/content-pdf-template-util';
import { getEventLocationName, recipientParentKey } from '@okr/shared-util-core';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { eventWhen } from '../calendar/mail';
import { countLetterPages, postalOf, type LetterEvent } from '../email/mailing-letters';
import { resolveAttachmentBytes, type MailingAttachmentFields, type ResolvedAttachment } from '../email/mailing';
import { isElevated } from '../email/mailing-recipients';
import { parseCaleventKeys } from '../email/personal-mail.logic';
import { getCreditPort, type CreditPort } from './credit-port';

const REGION = 'europe-west6';
const MAX_POST_RECIPIENTS = 3000;
const ADDRESS_READ_CHUNK = 20;

export const quoteTokenSecret = defineSecret('POSTVERSAND_QUOTE_SECRET');

export interface QuotePayload {
  tenantId: string;
  draftHash: string;
  recipients: string[];
  options: PostOptions;
  letters: number;
  pages: number;
  total: number;
}

export interface PostQuote {
  letters: number;
  abroad: number;
  missing: number;
  pagesPerLetter: number;
  pages: number;
  total: number;
  balance: number;
  sufficient: boolean;
  token: string;
}

export interface QuoteInput {
  tenantId: string;
  subject: string;
  body: string;
  attachments: ResolvedAttachment[];
  letterQrCodes: boolean;
  caleventKeys: string[];
  postKeys: string[];
  options: PostOptions;
}

/** JSON with sorted object keys, so equal payloads sign equally. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function normalized(p: QuotePayload): QuotePayload {
  return { ...p, recipients: [...p.recipients].sort() };
}

export function signQuote(payload: QuotePayload, secret: string): string {
  return createHmac('sha256', secret).update(canonicalJson(normalized(payload))).digest('hex');
}

export function verifyQuote(token: string, payload: QuotePayload, secret: string): boolean {
  if (typeof token !== 'string') return false;
  const expected = Buffer.from(signQuote(payload, secret), 'utf8');
  const given = Buffer.from(token, 'utf8');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** SHA-256 over what the letters are made of: subject, body, each attachment (name + SHA-256 of its bytes), QR flag, calevent keys. */
export function draftHashOf(i: Pick<QuoteInput, 'subject' | 'body' | 'attachments' | 'letterQrCodes' | 'caleventKeys'>): string {
  return createHash('sha256').update(canonicalJson({
    subject: i.subject, body: i.body, attachments: i.attachments.map((a) => ({ filename: a.filename, sha256: createHash('sha256').update(a.content).digest('hex') })),
    letterQrCodes: i.letterQrCodes, caleventKeys: i.caleventKeys,
  })).digest('hex');
}

export interface QuoteDeps {
  port: CreditPort;
  secret: string;
  /** Page count of one letter of the draft (letter + PDF attachments, with the QR block when asked). */
  countLetterPages(args: { tenantId: string; subject: string; body: string; attachments: ResolvedAttachment[]; withQrBlock: boolean }): Promise<number>;
  /** Per recipient key (same order): the country code of its postal address, or undefined when it has none. */
  readCountryCodes(tenantId: string, keys: string[]): Promise<(string | undefined)[]>;
}

export interface QuoteCaller {
  roles?: unknown;
  tenants?: string[];
}

/** Post goes only through memberAdmin / privileged / admin of the tenant; a group admin may not send by post. */
export function assertMayPost(caller: QuoteCaller, tenantId: string): void {
  if (!isElevated(caller.roles) || !(caller.tenants ?? []).includes(tenantId)) {
    throw new HttpsError('permission-denied', 'This operation requires the memberAdmin or privileged role.');
  }
}

export async function quoteMailingLettersCore(deps: QuoteDeps, input: QuoteInput, caller: QuoteCaller): Promise<PostQuote> {
  assertMayPost(caller, input.tenantId);
  const keys = [...new Set(input.postKeys)];
  const countries = await deps.readCountryCodes(input.tenantId, keys);
  const swiss: string[] = [];
  let abroad = 0;
  let missing = 0;
  keys.forEach((key, i) => {
    const country = countries[i];
    if (country === undefined) missing++;
    else if (isSwissAddress(country)) swiss.push(key);
    else abroad++;
  });
  const letters = swiss.length;
  const pagesPerLetter = letters === 0 ? 0 : await deps.countLetterPages({
    tenantId: input.tenantId, subject: input.subject, body: input.body, attachments: input.attachments,
    withQrBlock: input.letterQrCodes && input.caleventKeys.length > 0,
  });
  const pages = letters * pagesPerLetter;
  const total = letters === 0 ? 0 : deps.port.quote(letters, pages).total;
  const balance = await deps.port.balance(input.tenantId);
  const payload: QuotePayload = {
    tenantId: input.tenantId, draftHash: draftHashOf(input), recipients: swiss, options: input.options, letters, pages, total,
  };
  return { letters, abroad, missing, pagesPerLetter, pages, total, balance, sufficient: balance >= total, token: signQuote(payload, deps.secret) };
}

/** The request's own fields; the attachments are resolved to bytes afterwards. */
export function parseInput(raw: unknown): Omit<QuoteInput, 'attachments'> {
  const d = (raw ?? {}) as Record<string, unknown>;
  if (typeof d['tenantId'] !== 'string' || !d['tenantId']) throw new HttpsError('invalid-argument', 'tenantId is required.');
  const tenantId = d['tenantId'];
  if (typeof d['subject'] !== 'string' || !d['subject'].trim()) throw new HttpsError('invalid-argument', 'subject is required.');
  if (typeof d['body'] !== 'string') throw new HttpsError('invalid-argument', 'body is required.');
  const postKeys = d['postKeys'];
  if (!Array.isArray(postKeys) || postKeys.some((k) => typeof k !== 'string' || !k)) throw new HttpsError('invalid-argument', 'postKeys must be a list of strings.');
  if (postKeys.length > MAX_POST_RECIPIENTS) throw new HttpsError('invalid-argument', `At most ${MAX_POST_RECIPIENTS} recipients.`);
  const o = (d['options'] ?? {}) as Partial<PostOptions>;
  const options: PostOptions = {
    deliveryProduct: o.deliveryProduct === 'fast' ? 'fast' : o.deliveryProduct === 'cheap' ? 'cheap' : DEFAULT_POST_OPTIONS.deliveryProduct,
    printSpectrum: o.printSpectrum === 'color' ? 'color' : o.printSpectrum === 'grayscale' ? 'grayscale' : DEFAULT_POST_OPTIONS.printSpectrum,
    printMode: o.printMode === 'duplex' ? 'duplex' : o.printMode === 'simplex' ? 'simplex' : DEFAULT_POST_OPTIONS.printMode,
  };
  return {
    tenantId, subject: d['subject'], body: d['body'], options,
    letterQrCodes: d['letterQrCodes'] === true, caleventKeys: parseCaleventKeys(d['caleventKeys']), postKeys: postKeys as string[],
  };
}

async function readCountryCodes(tenantId: string, keys: string[]): Promise<(string | undefined)[]> {
  const db = getFirestore();
  const out: (string | undefined)[] = [];
  for (let i = 0; i < keys.length; i += ADDRESS_READ_CHUNK) {
    const part = await Promise.all(keys.slice(i, i + ADDRESS_READ_CHUNK).map(async (key) => {
      const address = await postalOf(db, recipientParentKey(key), tenantId);
      return address?.countryCode;   // only the country leaves this function
    }));
    out.push(...part);
  }
  return out;
}

async function answerEventsOf(caleventKeys: string[]): Promise<LetterEvent[]> {
  if (caleventKeys.length === 0) return [];
  const db = getFirestore();
  const snaps = await db.getAll(...caleventKeys.map((key) => db.collection('calevents').doc(key)));
  return snaps
    .map((s) => s.data() as ({ name?: string; startDate?: string; startTime?: string } & Parameters<typeof getEventLocationName>[0]) | undefined)
    .filter((e) => !!e)
    .map((e) => ({ name: String(e?.name ?? ''), when: eventWhen(e?.startDate, e?.startTime), location: getEventLocationName(e) }));
}

// 2GiB: one sample letter is rendered in Chromium, as onMailing and generateDocument do
export const quoteMailingLetters = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '2GiB', timeoutSeconds: 120, secrets: [quoteTokenSecret] },
  async (request: CallableRequest<unknown>): Promise<PostQuote> => {
    const CF_NAME = 'quoteMailingLetters';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const parsed = parseInput(request.data);
    const port = getCreditPort();
    const caller = (await getFirestore().collection('users').doc(request.auth?.uid ?? '').get()).data() ?? {};
    assertMayPost(caller, parsed.tenantId);   // before any attachment, render or address read
    const input: QuoteInput = { ...parsed, attachments: await resolveAttachmentBytes(request.data as MailingAttachmentFields, parsed.tenantId) };
    const answerEvents = input.letterQrCodes ? await answerEventsOf(input.caleventKeys) : [];
    return quoteMailingLettersCore({
      port, secret: quoteTokenSecret.value(), readCountryCodes,
      countLetterPages: (a) => countLetterPages({ ...a, attachmentBytes: a.attachments, attachments: [], answerEvents }),
    }, input, caller);
  },
);
