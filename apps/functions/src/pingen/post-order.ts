// apps/functions/src/pingen/post-order.ts
//
// The price of a Versand by post (spec 1.150), computed in ONE place for both sides of the deal:
// `quoteMailingLetters` shows it to the sender and signs it; `sendMailing` recomputes it from the request,
// verifies the signature and takes it from the tenant's prepaid credit.
//
// Privacy: postal addresses are read only for their country code; only counts leave the server.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { defineSecret } from 'firebase-functions/params';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_POST_OPTIONS, type PostOptions } from '@okr/shared-models';
import { isSwissAddress } from '@okr/content-pdf-template-util';
import { getEventLocationName, recipientParentKey } from '@okr/shared-util-core';

import { eventWhen } from '../calendar/mail';
import { countLetterPages, postalOf, type LetterEvent } from '../email/mailing-letters';
import type { ResolvedAttachment } from '../email/mailing';
import { isElevated } from '../email/mailing-recipients';
import type { CreditPort } from './credit-port';

const ADDRESS_READ_CHUNK = 20;

export const quoteTokenSecret = defineSecret('POSTVERSAND_QUOTE_SECRET');

/** A token older than this is refused: the price and the balance it was quoted against are stale. */
export const QUOTE_TTL_MS = 30 * 60 * 1000;

export interface QuotePayload {
  /** issued at, ms epoch */
  iat: number;
  tenantId: string;
  draftHash: string;
  recipients: string[];
  options: PostOptions;
  letters: number;
  pages: number;
  total: number;
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
  return { ...p, recipients: [...new Set(p.recipients)].sort() };
}

export function signQuote(payload: QuotePayload, secret: string): string {
  return createHmac('sha256', secret).update(canonicalJson(normalized(payload))).digest('hex');
}

export function verifyQuote(token: string, payload: QuotePayload, secret: string, now: number): boolean {
  if (typeof token !== 'string') return false;
  if (!Number.isFinite(payload.iat) || now - payload.iat > QUOTE_TTL_MS || payload.iat > now) return false;
  const expected = Buffer.from(signQuote(payload, secret), 'utf8');
  const given = Buffer.from(token, 'utf8');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** SHA-256 over what the letters are made of: subject, body, each attachment (name, content type, SHA-256 of its bytes), QR flag, calevent keys. */
export function draftHashOf(i: Pick<QuoteInput, 'subject' | 'body' | 'attachments' | 'letterQrCodes' | 'caleventKeys'>): string {
  return createHash('sha256').update(canonicalJson({
    subject: i.subject, body: i.body, attachments: i.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, sha256: createHash('sha256').update(a.content).digest('hex') })),
    letterQrCodes: i.letterQrCodes, caleventKeys: [...i.caleventKeys].sort(),
  })).digest('hex');
}

/** The letter options as the server accepts them: anything unknown falls back to the default. */
export function parseOptions(raw: unknown): PostOptions {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Partial<PostOptions>;
  return {
    deliveryProduct: o.deliveryProduct === 'fast' ? 'fast' : o.deliveryProduct === 'cheap' ? 'cheap' : DEFAULT_POST_OPTIONS.deliveryProduct,
    printSpectrum: o.printSpectrum === 'color' ? 'color' : o.printSpectrum === 'grayscale' ? 'grayscale' : DEFAULT_POST_OPTIONS.printSpectrum,
    printMode: o.printMode === 'duplex' ? 'duplex' : o.printMode === 'simplex' ? 'simplex' : DEFAULT_POST_OPTIONS.printMode,
  };
}

export interface QuoteDeps {
  port: CreditPort;
  secret: string;
  /** ms epoch; the token's `iat` */
  now: number;
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

export interface ComputedQuote {
  letters: number;
  abroad: number;
  missing: number;
  pagesPerLetter: number;
  pages: number;
  total: number;
  payload: QuotePayload;
}

/**
 * The one recomputation: classify the recipients (Swiss / abroad / no address), count the pages of one letter,
 * price letters x pages through the port. The payload is what the quote token signs.
 */
export async function computeQuote(deps: Omit<QuoteDeps, 'secret'>, input: QuoteInput): Promise<ComputedQuote> {
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
  const payload: QuotePayload = {
    iat: deps.now, tenantId: input.tenantId, draftHash: draftHashOf(input), recipients: swiss, options: input.options, letters, pages, total,
  };
  return { letters, abroad, missing, pagesPerLetter, pages, total, payload };
}

export async function readCountryCodes(tenantId: string, keys: string[]): Promise<(string | undefined)[]> {
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

export async function answerEventsOf(caleventKeys: string[]): Promise<LetterEvent[]> {
  if (caleventKeys.length === 0) return [];
  const db = getFirestore();
  const snaps = await db.getAll(...caleventKeys.map((key) => db.collection('calevents').doc(key)));
  return snaps
    .map((s) => s.data() as ({ name?: string; startDate?: string; startTime?: string } & Parameters<typeof getEventLocationName>[0]) | undefined)
    .filter((e) => !!e)
    .map((e) => ({ name: String(e?.name ?? ''), when: eventWhen(e?.startDate, e?.startTime), location: getEventLocationName(e) }));
}

export interface QuoteEnv {
  /** throws HttpsError 'unavailable' while no credit port is bound */
  getPort(): CreditPort;
  secret: string;
  now: number;
  readDocument?: (path: string) => Promise<{ content: Buffer; contentType: string }>;
  readCountryCodes: QuoteDeps['readCountryCodes'];
  /** the events of the letters' QR block */
  answerEventsOf(caleventKeys: string[]): Promise<LetterEvent[]>;
  renderPages(args: Parameters<typeof countLetterPages>[0]): Promise<number>;
}

/** The QuoteDeps for one input: the QR events are read only when the letters carry them. */
export async function quoteDepsOf(env: QuoteEnv, port: CreditPort, input: QuoteInput, now: number): Promise<QuoteDeps> {
  const answerEvents = input.letterQrCodes ? await env.answerEventsOf(input.caleventKeys) : [];
  return {
    port, secret: env.secret, now, readCountryCodes: env.readCountryCodes,
    countLetterPages: (a) => env.renderPages({ ...a, attachmentBytes: a.attachments, attachments: [], answerEvents }),
  };
}

/** What a Pingen send asks for: the request's `post` field. */
export interface PostRequest {
  via: 'pingen';
  options: PostOptions;
  token: string;
  /** the `iat` the token was signed with */
  issuedAt: number;
}

/** The `post` part of the `mailings` doc: the accepted order. Task 7 fans the letters out from it. */
export interface MailingPost {
  via: 'pingen';
  options: PostOptions;
  /** the priced Swiss recipients (deduped, sorted): exactly the set the deduction covers; the letters go to these */
  recipients: string[];
  letters: number;
  abroad: number;
  pages: number;
  total: number;
  creditEntryId: string;
  acceptedBy: string;
  acceptedAt: string;
}

export interface PostOrderArgs {
  post: PostRequest;
  tenantId: string;
  subject: string;
  body: string;
  attachments: ResolvedAttachment[];
  letterQrCodes: boolean;
  caleventKeys: string[];
  postKeys: string[];
  mailingKey: string;
  /** whether the mailing doc already exists (a replay of the same quote, or a write that committed) */
  mailingExists(): Promise<boolean>;
  /** the caller's uid: the credit entry records who spent it */
  actor: string;
  caller: QuoteCaller;
  /** for `acceptedAt` */
  nowIso: string;
}

/** The request's `post` field, or undefined when the Versand does not go by Pingen. */
export function parsePostRequest(raw: unknown): PostRequest | undefined {
  if (raw === undefined || raw === null) return undefined;
  const p = raw as Record<string, unknown>;
  if (typeof raw !== 'object' || p['via'] !== 'pingen') throw new HttpsError('invalid-argument', 'Unknown post delivery.');
  if (typeof p['token'] !== 'string' || typeof p['issuedAt'] !== 'number') throw new HttpsError('invalid-argument', 'The quote is missing.');
  return { via: 'pingen', options: parseOptions(p['options']), token: p['token'], issuedAt: p['issuedAt'] };
}

/** The mailing id of a Pingen send: the same quote token always names the same Versand, so a replay cannot charge twice. */
export function postMailingKey(tenantId: string, token: string): string {
  return createHash('sha256').update(`${tenantId}:${token}`).digest('hex').slice(0, 20);
}

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}

export interface PostOrderResult<T> {
  /** the same quote was accepted before: nothing deducted, nothing written */
  duplicate: boolean;
  value?: T;
}

/**
 * Accepts a Pingen order around `work` (which stores the attachments and creates the mailing doc):
 * port (fails closed) → recompute and verify the quote → replay check → deduct once → `work(post)`.
 * If `work` fails the deduction is reversed in whole, unless the mailing doc exists after all (the write
 * committed); the ORIGINAL error is always rethrown, a failed reversal is only logged.
 * With no Swiss letter nothing is deducted and `work` gets `undefined`: the Post part is the download.
 */
export async function withPostOrder<T>(env: QuoteEnv, args: PostOrderArgs, work: (post: MailingPost | undefined) => Promise<T>): Promise<PostOrderResult<T>> {
  assertMayPost(args.caller, args.tenantId);
  const port = env.getPort();
  const input: QuoteInput = {
    tenantId: args.tenantId, subject: args.subject, body: args.body, attachments: args.attachments,
    letterQrCodes: args.letterQrCodes, caleventKeys: args.caleventKeys, postKeys: args.postKeys, options: args.post.options,
  };
  const computed = await computeQuote(await quoteDepsOf(env, port, input, args.post.issuedAt), input);
  if (!verifyQuote(args.post.token, computed.payload, env.secret, env.now)) throw new HttpsError('failed-precondition', 'price-changed');
  if (await args.mailingExists()) return { duplicate: true };
  if (computed.letters === 0) return { duplicate: false, value: await work(undefined) };

  // insufficient credit surfaces as the port's failed-precondition
  const entry = await port.deduct(args.tenantId, { letters: computed.letters, pages: computed.pages, reference: `mailing.${args.mailingKey}`, actor: args.actor });
  const post: MailingPost = {
    via: 'pingen', options: args.post.options, recipients: [...new Set(computed.payload.recipients)].sort(),
    letters: computed.letters, abroad: computed.abroad, pages: computed.pages, total: computed.total,
    creditEntryId: entry.entryId, acceptedBy: args.actor, acceptedAt: args.nowIso,
  };
  try {
    return { duplicate: false, value: await work(post) };
  } catch (error) {
    const key = `mailing.${args.mailingKey}-undo`;
    try {
      if (await args.mailingExists()) {
        // the write committed (or a concurrent send of the same quote won): the deduction pays for it
        if (isAlreadyExists(error)) return { duplicate: true };
      } else {
        await port.reverseShare(args.tenantId, entry.entryId, { units: computed.letters, pages: computed.pages }, key, 'mailing not stored');
      }
    } catch (reversalError) {
      logger.error('postversand: deduction not reversed', {
        tenantId: args.tenantId, entryId: entry.entryId, key, letters: computed.letters, pages: computed.pages, total: computed.total,
        error: String((error as Error)?.message ?? error), reversalError: String((reversalError as Error)?.message ?? reversalError),
      });
    }
    throw error;
  }
}
