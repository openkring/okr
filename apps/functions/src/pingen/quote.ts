// apps/functions/src/pingen/quote.ts
//
// What the sender sees before sending a Versand by post (spec 1.150): letters, pages, the price taken later
// from the tenant's prepaid credit, and a signed token that `sendMailing` verifies, so the price the sender
// agreed to is the price that is deducted for exactly this draft and these recipients.
//
// Privacy: postal addresses are read only for their country code; only counts leave the server.

import { CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { CreditAccountCollection } from '@okr/shared-models';
import { checkAppCheckToken, checkAuthentication } from '@okr/shared-util-functions';

import { countLetterPages } from '../email/mailing-letters';
import { resolveAttachmentBytes, type MailingAttachmentFields } from '../email/mailing';
import { parseCaleventKeys } from '../email/personal-mail.logic';
import { getCreditPort } from './credit-port';
import {
  answerEventsOf, assertMayPost, computeQuote, mayPost, parseOptions, quoteDepsOf, quoteTokenSecret, readCountryCodes, signQuote,
  type QuoteCaller, type QuoteDeps, type QuoteEnv, type QuoteInput,
} from './post-order';

// the pricing and signing live in post-order.ts, shared with `sendMailing`
export { assertMayPost, draftHashOf, QUOTE_TTL_MS, quoteTokenSecret, signQuote, verifyQuote } from './post-order';
export type { QuoteCaller, QuoteDeps, QuoteEnv, QuoteInput, QuotePayload } from './post-order';

const REGION = 'europe-west6';
const MAX_POST_RECIPIENTS = 3000;

export interface PostQuote {
  /** spec 1.150 §10: the Pingen option is offered; see PingenUnavailable for the other answer */
  pingenAvailable: true;
  /** the `iat` the token was signed with; `sendMailing` rebuilds the payload with it */
  issuedAt: number;
  letters: number;
  abroad: number;
  missing: number;
  pagesPerLetter: number;
  pages: number;
  total: number;
  /** Rappen per letter and per page; the total is letters x perUnit + pages x perPage */
  perUnit: number;
  perPage: number;
  balance: number;
  sufficient: boolean;
  token: string;
}

/**
 * Spec 1.150 §10: the tenant has no prepaid credit account, or the caller may not send by post (a group admin).
 * Not an error: the composer offers only the PDF download. `sendMailing` still refuses a Pingen send in both cases.
 */
export interface PingenUnavailable {
  pingenAvailable: false;
}

export type PostQuoteResult = PostQuote | PingenUnavailable;

const UNAVAILABLE: PingenUnavailable = { pingenAvailable: false };

/** What the callable needs beyond the pricing environment. */
export interface QuoteCallableEnv extends QuoteEnv {
  /** whether `credit-accounts/{tenantId}` exists: without it the tenant has no prepaid credit for letters */
  hasCreditAccount(tenantId: string): Promise<boolean>;
}

export async function quoteMailingLettersCore(deps: QuoteDeps, input: QuoteInput, caller: QuoteCaller): Promise<PostQuote> {
  assertMayPost(caller, input.tenantId);
  const c = await computeQuote(deps, input);
  const balance = await deps.port.balance(input.tenantId);
  return {
    pingenAvailable: true, issuedAt: deps.now, letters: c.letters, abroad: c.abroad, missing: c.missing, pagesPerLetter: c.pagesPerLetter, pages: c.pages, total: c.total, perUnit: c.perUnit, perPage: c.perPage,
    balance, sufficient: balance >= c.total, token: signQuote(c.payload, deps.secret),
  };
}

/** The request's own fields; the attachments are resolved to bytes afterwards. */
export function parseInput(raw: unknown): Omit<QuoteInput, 'attachments'> {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown): boolean => v === undefined || typeof v === 'string';
  if (!text(d['storagePath']) || !text(d['filename'])) throw new HttpsError('invalid-argument', 'Invalid attachment.');
  if (d['extraAttachments'] !== undefined && !Array.isArray(d['extraAttachments'])) throw new HttpsError('invalid-argument', 'extraAttachments must be a list.');
  if (typeof d['tenantId'] !== 'string' || !d['tenantId']) throw new HttpsError('invalid-argument', 'tenantId is required.');
  const tenantId = d['tenantId'];
  if (typeof d['subject'] !== 'string' || !d['subject'].trim()) throw new HttpsError('invalid-argument', 'subject is required.');
  if (typeof d['body'] !== 'string') throw new HttpsError('invalid-argument', 'body is required.');
  const postKeys = d['postKeys'];
  if (!Array.isArray(postKeys) || postKeys.some((k) => typeof k !== 'string' || !k)) throw new HttpsError('invalid-argument', 'postKeys must be a list of strings.');
  if (postKeys.length > MAX_POST_RECIPIENTS) throw new HttpsError('invalid-argument', `At most ${MAX_POST_RECIPIENTS} recipients.`);
  const options = parseOptions(d['options']);
  return {
    tenantId, subject: d['subject'], body: d['body'], options,
    letterQrCodes: d['letterQrCodes'] === true, caleventKeys: parseCaleventKeys(d['caleventKeys']), postKeys: postKeys as string[],
  };
}

/**
 * Everything the callable does after the App Check / auth checks. Order matters: input shape, then the caller and the
 * tenant's credit account (`pingenAvailable: false` before anything else is learned or read), then the credit port,
 * then attachment reads and renders.
 */
export async function quoteWithCaller(env: QuoteCallableEnv, data: unknown, caller: QuoteCaller): Promise<PostQuoteResult> {
  const parsed = parseInput(data);
  if (!mayPost(caller, parsed.tenantId)) return UNAVAILABLE;
  if (!(await env.hasCreditAccount(parsed.tenantId))) return UNAVAILABLE;
  const port = env.getPort();
  const input: QuoteInput = { ...parsed, attachments: await resolveAttachmentBytes(data as MailingAttachmentFields, parsed.tenantId, env.readDocument) };
  return quoteMailingLettersCore(await quoteDepsOf(env, port, input, env.now), input, caller);
}

// 2GiB: one sample letter is rendered in Chromium, as onMailing and generateDocument do
export const quoteMailingLetters = onCall(
  { region: REGION, enforceAppCheck: true, cors: true, memory: '2GiB', timeoutSeconds: 120, secrets: [quoteTokenSecret] },
  async (request: CallableRequest<unknown>): Promise<PostQuoteResult> => {
    const CF_NAME = 'quoteMailingLetters';
    checkAppCheckToken(request as never, CF_NAME);
    checkAuthentication(request as never, CF_NAME);
    const db = getFirestore();
    const caller = (await db.collection('users').doc(request.auth?.uid ?? '').get()).data() ?? {};
    return quoteWithCaller({
      getPort: getCreditPort, secret: quoteTokenSecret.value(), now: Date.now(),
      readCountryCodes, answerEventsOf, renderPages: countLetterPages,
      hasCreditAccount: async (tenantId) => (await db.collection(CreditAccountCollection).doc(tenantId).get()).exists,
    }, request.data, caller);
  },
);
