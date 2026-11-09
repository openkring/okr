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
  /** the rates the total is made of (Rappen); 0 without a letter */
  perUnit: number;
  perPage: number;
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
  const priced = letters === 0 ? { total: 0, perUnit: 0, perPage: 0 } : deps.port.quote(letters, pages);
  const total = priced.total;
  const payload: QuotePayload = {
    iat: deps.now, tenantId: input.tenantId, draftHash: draftHashOf(input), recipients: swiss, options: input.options, letters, pages, total,
  };
  return { letters, abroad, missing, pagesPerLetter, pages, total, perUnit: priced.perUnit, perPage: priced.perPage, payload };
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
  /** StoreDateTime (`yyyyMMddHHmmss`, `getTodayStr(DateFormat.StoreDateTime)`): the nightly reconcile ranges on it */
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
  /** the `post-orders` lock of this quote: taken before any money moves */
  lock: PostLock;
  /** the caller's uid: the credit entry records who spent it */
  actor: string;
  caller: QuoteCaller;
  /** for `acceptedAt`: StoreDateTime (getTodayStr), despite the name */
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

/** Functions-only collection (no client access, see firestore.rules). */
export const PostOrderCollection = 'post-orders';

export type PostLockState = 'pending' | 'done' | 'failed';

/** The `post-orders/{mailingKey}` lock doc (functions-only collection): one holder per quote token. */
export interface PostLock {
  /**
   * creates the lock as `pending` with what the deduction will charge (the nightly reconcile reverses a dead order
   * in whole from it); when it exists already, says in which state
   */
  acquire(order: { letters: number; pages: number }): Promise<{ acquired: true } | { acquired: false; state: PostLockState }>;
  set(state: 'done' | 'failed'): Promise<void>;
  /** drops the lock: no money moved, the same quote may be retried */
  remove(): Promise<void>;
}

export interface PostOrderDoc {
  tenantId: string;
  state: PostLockState;
  createdAt: string;
  /** createdAt + 1 day; a Firestore TTL policy on this field can be added later */
  expiresAt: string;
  /** what the deduction charges; missing on locks written before the reconcile needed them (logged, skipped there) */
  letters?: number;
  pages?: number;
}

/** The mailing id of a Pingen send: the same quote token always names the same Versand, so a replay cannot charge twice. */
export function postMailingKey(tenantId: string, token: string): string {
  return createHash('sha256').update(`${tenantId}:${token}`).digest('hex').slice(0, 20);
}

export interface PostOrderResult<T> {
  /** the same quote was accepted before: nothing deducted, nothing written */
  duplicate: boolean;
  value?: T;
}

/**
 * Accepts a Pingen order around `work` (which stores the attachments and creates the mailing doc):
 * port (fails closed) → recompute and verify the quote → take the lock → deduct once → `work(post)` → lock `done`.
 * A lock that exists: `done` = the same Versand (duplicate, nothing deducted), `pending` = another request is
 * on it (`aborted`), `failed` = the quote was spent on a failed send, so the sender re-quotes (`price-changed`).
 * Only the holder deducts. If anything fails after the lock, the holder reverses its deduction in whole (unless the
 * mailing doc exists after all), sets the lock `failed` and rethrows the ORIGINAL error; a failed reversal or lock
 * update is only logged. With no Swiss letter nothing is deducted and the Post part is the download.
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

  // no Swiss letter: no money moves, so no lock either; the Post part is the download
  if (computed.letters === 0) return { duplicate: false, value: await work(undefined) };

  const taken = await args.lock.acquire({ letters: computed.letters, pages: computed.pages });
  if (!taken.acquired) {
    if (taken.state === 'done') return { duplicate: true };
    if (taken.state === 'pending') throw new HttpsError('aborted', 'send in progress');
    throw new HttpsError('failed-precondition', 'price-changed');
  }
  const key = `mailing.${args.mailingKey}-undo`;
  const setLock = async (state: 'done' | 'failed'): Promise<void> => {
    try {
      await args.lock.set(state);
    } catch (e) {
      logger.error('postversand: lock not updated', { tenantId: args.tenantId, mailingKey: args.mailingKey, state, error: String((e as Error)?.message ?? e) });
    }
  };
  const reference = `mailing.${args.mailingKey}`;
  let entryId: string | undefined;
  let deducting = false;
  try {
    let post: MailingPost | undefined;
    // insufficient credit surfaces as the port's failed-precondition
    deducting = true;
    const entry = await port.deduct(args.tenantId, { letters: computed.letters, pages: computed.pages, reference, actor: args.actor });
    entryId = entry.entryId;
    post = {
      via: 'pingen', options: args.post.options, recipients: [...new Set(computed.payload.recipients)].sort(),
      letters: computed.letters, abroad: computed.abroad, pages: computed.pages, total: computed.total,
      creditEntryId: entry.entryId, acceptedBy: args.actor, acceptedAt: args.nowIso,
    };
    const value = await work(post);
    await setLock('done');
    return { duplicate: false, value };
  } catch (error) {
    if (entryId === undefined && isInsufficientCredit(error)) {
      // no money moved: the sender may top up and retry with the same quote
      try { await args.lock.remove(); } catch (e) {
        logger.error('postversand: lock not removed', { tenantId: args.tenantId, mailingKey: args.mailingKey, error: String((e as Error)?.message ?? e) });
      }
      throw error;
    }
    // deduct may have thrown after its transaction committed: the entry id is deterministic (`deduct-<reference>`)
    const reverseId = entryId ?? (deducting ? `deduct-${reference}` : undefined);
    if (entryId === undefined && deducting) {
      logger.error('postversand: deduct failed, reversing by reference', { tenantId: args.tenantId, reference, error: String((error as Error)?.message ?? error) });
    }
    let committed = false;
    try {
      committed = await args.mailingExists();
      if (!committed && reverseId !== undefined) {
        await port.reverseShare(args.tenantId, reverseId, { units: computed.letters, pages: computed.pages }, key, 'mailing not stored');
      }
    } catch (reversalError) {
      logger.error('postversand: deduction not reversed', {
        tenantId: args.tenantId, entryId: reverseId, reference, key, letters: computed.letters, pages: computed.pages, total: computed.total,
        error: String((error as Error)?.message ?? error), reversalError: String((reversalError as Error)?.message ?? reversalError),
      });
    }
    await setLock(committed ? 'done' : 'failed');
    throw error;
  }
}

function isInsufficientCredit(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return e?.code === 'failed-precondition' && e?.message === 'insufficient-credit';
}
