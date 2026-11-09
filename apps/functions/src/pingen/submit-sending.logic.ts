// apps/functions/src/pingen/submit-sending.logic.ts
//
// Handing one queued `sendings` record to Pingen (spec 1.150) and the fallback when Pingen refuses it. Pure core:
// every effect (Pingen, Storage, Firestore, tasks, the credit port, the clock) is injected, so the tests touch
// none of them. The production wiring and the trigger are in submit-sending.ts.
//
// Exactly-once: the trigger claims `queued` -> `submitting` in a transaction before it calls Pingen. The record id
// is Pingen's `Idempotency-Key`, so a delivery that finds `submitting` (a previous attempt crashed or was retried
// after claiming) calls Pingen again and gets the SAME letter back, never a second one. The success write is
// guarded on `submitting`, a failure write too: whatever a webhook (or Task 9) moved the record to is not overwritten.

import { logger } from 'firebase-functions/v2';
import { shouldHoldVersand } from '@okr/content-pdf-template-util';
import type { AvatarInfo, SendingCost, SendingModel } from '@okr/shared-models';
import { PingenError, type PingenClient } from './pingen-client';

export type SendingRow = Omit<SendingModel, 'okey'> & { id: string };

/** The Versand a letter belongs to (the `mailings/<key>` doc, reduced to what the fallback needs). */
export interface SendingMailing {
  senderKey: string;
  senderName: string;
  subject: string;
  creditEntryId: string;
  /** what the deduction charged per letter: the share a reversal returns */
  pagesPerLetter: number;
}

export interface SubmitTask {
  tenantId: string;
  name: string;
  assignee: AvatarInfo;
  dueInDays: number;
  relatedModelType: string;
  relatedKey: string;
  linkKey?: string;
  notes: string;
}

export interface SubmitDeps {
  client: PingenClient;
  env: 'staging' | 'production';
  readPdf(path: string): Promise<Buffer>;
  getSending(id: string): Promise<SendingRow | undefined>;
  /** merges `patch`; with `expectState` only when the record is in that state. false = not applied */
  updateSending(id: string, patch: Partial<SendingRow>, expectState?: SendingRow['state']): Promise<boolean>;
  writeCost(id: string, cost: SendingCost): Promise<void>;
  /** merges the Pingen id whenever the record is not `failed`, without touching its state */
  setProviderId(id: string, providerId: string): Promise<boolean>;
  /** completes any open task of that key */
  closeOpenTask(relatedKey: string, tenantId: string): Promise<void>;
  loadMailing(source: string, tenantId: string): Promise<SendingMailing | undefined>;
  countAddressFailures(source: string): Promise<number>;
  listQueued(source: string): Promise<SendingRow[]>;
  avatar(personKey: string, tenantId: string, fallbackName: string): Promise<AvatarInfo>;
  hasOpenTask(relatedKey: string, assigneeKey: string, tenantId: string): Promise<boolean>;
  createTask(task: SubmitTask): Promise<void>;
  reverseShare(tenantId: string, entryId: string, part: { units: number; pages: number }, key: string, reason: string): Promise<{ amount: number; duplicate: boolean }>;
  now(): Date;
}

/** What the failure path (failSending) needs: Task 9's webhook handler runs it without a Pingen client. */
export type FailDeps = Pick<SubmitDeps, 'updateSending' | 'loadMailing' | 'reverseShare' | 'hasOpenTask' | 'createTask' | 'avatar' | 'now'>;

export type FailReason = 'address' | 'other';

/** A retryable failure older than this fails the letter and returns its share instead of retrying forever. */
export const MAX_AGE_MS = 24 * 3600 * 1000;

export const HOLD_DETAIL = 'angehalten: zu viele Adressfehler';

/**
 * Pingen's error code/title are not pinned for address problems (the client keeps only status + code/title in the
 * message). Letters are created with the address read from the PDF, so a refusal of the letter itself is, in
 * practice, an address problem: 400 and 422 count as such, as does any message naming the address or recipient.
 * 401/403/404/402 (credentials, rights, organisation, billing) are configuration problems: 'other'.
 */
export function isAddressFailure(err: unknown): boolean {
  if (!(err instanceof PingenError)) return false;
  return err.status === 400 || err.status === 422 || /address|adresse|recipient|postal|country|zip/i.test(err.message);
}

/** 422 or a message naming the address: certainly an address problem (a bare 400 is only likely one). */
export function isClearAddressFailure(err: unknown): boolean {
  return err instanceof PingenError && (err.status === 422 || /address|adresse|recipient|postal|country|zip/i.test(err.message));
}

/**
 * A 409, or an error whose code/title speaks of idempotency: Pingen may or may not hold the letter. Neither
 * retrying nor refunding is safe.
 */
export function isAmbiguousFailure(err: unknown): boolean {
  return err instanceof PingenError && (err.status === 409 || /idempoten/i.test(err.message));
}

/**
 * Retryable in this trigger: the client's retryable set plus 402 (Pingen's own balance is empty: bkaiser tops up,
 * the letter goes out on a later attempt). Classified here, not in pingen-client, whose generic mapping stays
 * "4xx is final" for its other callers.
 */
export function isRetryableHere(err: PingenError): boolean {
  return err.retryable || err.status === 402;
}

/** A safe file name; on staging the recipient's name, so Pingen's simulation names work with test persons. */
export function sendingFileName(env: 'staging' | 'production', id: string, recipientName: string): string {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  const base = env === 'staging' ? clean(recipientName) : '';
  return `${base || id.replace(/[^A-Za-z0-9_.-]+/g, '_') || 'brief'}.pdf`;
}

const sourceKey = (source: string): string => source.replace(/^mailing\./, '');

function patchFailed(rec: SendingRow, detail: string, failReason: FailReason, at: string): Partial<SendingRow> {
  return { state: 'failed', failReason, history: [...rec.history, { state: 'failed', at, detail }], updatedAt: at };
}

/** Never throws: the money has to go back and the task has to exist, whatever else failed. */
async function reverse(deps: FailDeps, rec: SendingRow, mailing: SendingMailing | undefined, reason: string): Promise<void> {
  const tenantId = rec.tenants[0] ?? '';
  if (!mailing?.creditEntryId) {
    logger.error('submit-sending: no deduction entry for the letter, reverse by hand', { id: rec.id, source: rec.source });
    return;
  }
  try {
    // key = record id: the same key Task 7's fan-out uses, so a reversal by either path happens once
    await deps.reverseShare(tenantId, mailing.creditEntryId, { units: 1, pages: mailing.pagesPerLetter || rec.pages }, rec.id, reason);
  } catch (err) {
    logger.error('submit-sending: reversal failed, reverse by hand', { id: rec.id, tenantId, entryId: mailing.creditEntryId, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Marks a letter failed (the history detail is the reason only, never a response body), opens ONE task for the
 * sender and returns the letter's share to the credit. The record is failed first so nothing can send it later;
 * a crash after that loses the task/reversal (logged), never causes a second send.
 * Task 9 reuses it for letters Pingen reports undeliverable (`reverse` as decided there).
 */
export async function failSending(
  deps: FailDeps, record: SendingRow, reason: string, reverseShare: boolean, failReason: FailReason = 'other', expectState?: SendingRow['state'],
): Promise<void> {
  const tenantId = record.tenants[0] ?? '';
  const at = deps.now().toISOString();
  // guarded on the submit path: a record that left `submitting` meanwhile gets no task and no refund
  if (!(await deps.updateSending(record.id, patchFailed(record, reason, failReason, at), expectState))) return;
  let mailing: SendingMailing | undefined;
  try {
    mailing = await deps.loadMailing(record.source, tenantId);
  } catch (err) {
    logger.error('submit-sending: mailing unreadable', { id: record.id, error: err instanceof Error ? err.message : String(err) });
  }
  // the keyed, idempotent reversal first: the money must not depend on the task being written
  if (reverseShare) await reverse(deps, record, mailing, `Brief ${record.id}: ${reason}`);
  if (mailing) {
    try {
      const relatedKey = `sending.${record.id}`;
      if (!(await deps.hasOpenTask(relatedKey, mailing.senderKey, tenantId))) {
        await deps.createTask({
          tenantId, name: `Brief an ${record.recipientName} konnte nicht per Post verschickt werden`,
          assignee: await deps.avatar(mailing.senderKey, tenantId, mailing.senderName), dueInDays: 3,
          relatedModelType: 'sending', relatedKey, linkKey: record.source, notes: reason,
        });
      }
    } catch (err) {
      logger.error('submit-sending: task for a failed letter not created', { id: record.id, error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    logger.error('submit-sending: no Versand for the letter, no task', { id: record.id, source: record.source });
  }
}

/** Pingen may hold the letter: keep `submitting`, no refund, no retry, one task for the sender (deduped by record). */
async function flagAmbiguous(deps: SubmitDeps, rec: SendingRow, err: { status?: number; message: string }): Promise<void> {
  const tenantId = rec.tenants[0] ?? '';
  logger.error('submit-sending: letter status unclear (Pingen may hold it), no refund, check in Pingen', { id: rec.id, tenantId, source: rec.source, status: err.status, error: err.message });
  try {
    const mailing = await deps.loadMailing(rec.source, tenantId);
    if (!mailing) return;
    const relatedKey = `sending.${rec.id}`;
    if (await deps.hasOpenTask(relatedKey, mailing.senderKey, tenantId)) return;
    await deps.createTask({
      tenantId, name: `Briefstatus unklar: ${rec.recipientName}`, assignee: await deps.avatar(mailing.senderKey, tenantId, mailing.senderName),
      dueInDays: 3, relatedModelType: 'sending', relatedKey, linkKey: rec.source, notes: `Brief ${rec.id}: ${err.message}`,
    });
  } catch (e) {
    logger.error('submit-sending: task for an unclear letter not created', { id: rec.id, error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Every remaining queued letter of the Versand becomes failed ('other'), its share reversed, and ONE task opens for
 * the whole Versand. Idempotent: the task is looked up before it is created, and each record is claimed with
 * expectState 'queued', so a second failure (or a concurrent instance) neither re-holds nor reverses twice.
 */
async function holdVersand(deps: SubmitDeps, source: string, tenantId: string, clearlyAddress: boolean): Promise<void> {
  const queued = await deps.listQueued(source);
  if (queued.length === 0) return;
  const mailing = await deps.loadMailing(source, tenantId);
  if (mailing) {
    const relatedKey = `mailing.${sourceKey(source)}`;
    try {
      // before the records change: a second run that still finds queued letters sees the task
      if (!(await deps.hasOpenTask(relatedKey, mailing.senderKey, tenantId))) {
        await deps.createTask({
          tenantId, name: `Versand ${mailing.subject}: Briefe angehalten — ${clearlyAddress ? 'Adressen prüfen' : 'Pingen hat mehrere Briefe abgelehnt'}`,
          assignee: await deps.avatar(mailing.senderKey, tenantId, mailing.senderName), dueInDays: 3,
          relatedModelType: 'mailing', relatedKey, notes: `${queued.length} Briefe wurden nicht verschickt, ihr Anteil ist zurückgebucht.`,
        });
      }
    } catch (err) {
      logger.error('submit-sending: Versand task not created', { source, error: err instanceof Error ? err.message : String(err) });
    }
  } else {
    logger.error('submit-sending: no Versand for the held letters, no task', { source });
  }
  for (const rec of queued) {
    const claimed = await deps.updateSending(rec.id, patchFailed(rec, HOLD_DETAIL, 'other', deps.now().toISOString()), 'queued');
    if (claimed) await reverse(deps, rec, mailing, `Brief ${rec.id}: ${HOLD_DETAIL}`);
  }
}

/** Pingen accepted a letter for a record that is `failed` (and refunded): log it and open one task for a human. */
async function flagSentDespiteRefund(deps: SubmitDeps, rec: SendingRow, providerId: string): Promise<void> {
  const tenantId = rec.tenants[0] ?? '';
  logger.error('submit-sending: Pingen holds a letter whose share was refunded, check and settle by hand', { tenantId, id: rec.id, providerId, source: rec.source, price: rec.price });
  try {
    const mailing = await deps.loadMailing(rec.source, tenantId);
    if (!mailing) return;
    // its own key: the failed letter's own task (`sending.<id>`) is usually still open and would suppress this one
    const relatedKey = `sending.${rec.id}.sent-after-refund`;
    if (await deps.hasOpenTask(relatedKey, mailing.senderKey, tenantId)) return;
    await deps.createTask({
      tenantId, name: `Brief an ${rec.recipientName} wurde trotz Rückerstattung verschickt — prüfen`,
      assignee: await deps.avatar(mailing.senderKey, tenantId, mailing.senderName), dueInDays: 3,
      relatedModelType: 'sending', relatedKey, linkKey: rec.source, notes: `Brief ${rec.id}, Pingen ${providerId}`,
    });
  } catch (e) {
    logger.error('submit-sending: task for a refunded-but-sent letter not created', { id: rec.id, error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * A retryable failure rethrows (the trigger retries with the same key). Past 24 h it stops: with an empty
 * `attemptedAt` Pingen was certainly never reached (the PDF read kept failing), so the letter fails and is
 * refunded; otherwise Pingen may hold it (a lost response), so it stays `submitting` for a human, no refund.
 */
async function retryOrGiveUp(deps: SubmitDeps, rec: SendingRow, err: unknown): Promise<void> {
  const created = Date.parse(rec.createdAt);
  if (Number.isFinite(created) && deps.now().getTime() - created > MAX_AGE_MS) {
    const message = err instanceof Error ? err.message : String(err);
    if (!rec.attemptedAt) return failSending(deps, rec, message, true, 'other', 'submitting');
    return flagAmbiguous(deps, rec, { status: err instanceof PingenError ? err.status : undefined, message });
  }
  throw err;
}

/** Submits one `sendings` record. Throws only when a retry can help (retryable Pingen error, Storage failure). */
export async function submitSending(deps: SubmitDeps, id: string): Promise<void> {
  let rec = await deps.getSending(id);
  if (!rec || (rec.state !== 'queued' && rec.state !== 'submitting')) return;   // tombstone, or a retry after success
  if (rec.state === 'queued') {
    const history = [...rec.history, { state: 'submitting' as const, at: deps.now().toISOString() }];
    if (!(await deps.updateSending(rec.id, { state: 'submitting', history, updatedAt: deps.now().toISOString() }, 'queued'))) return;   // another delivery claimed it
    rec = { ...rec, state: 'submitting', history };
  }
  // from here a `submitting` record is ours (or a crashed attempt's): Pingen dedupes by the key
  let pdf: Buffer;
  try {
    pdf = await deps.readPdf(rec.storagePath);
  } catch (err) {
    return retryOrGiveUp(deps, rec, err);
  }
  if (!rec.attemptedAt) {
    // BEFORE the first call: from here on Pingen may hold the letter whatever comes back
    const attemptedAt = deps.now().toISOString();
    if (!(await deps.updateSending(rec.id, { attemptedAt }, 'submitting'))) return;
    rec = { ...rec, attemptedAt };
  }
  let letter;
  try {
    letter = await deps.client.createLetter({ pdf, fileName: sendingFileName(deps.env, rec.id, rec.recipientName), options: rec.options, idempotencyKey: rec.id });
  } catch (err) {
    if (!(err instanceof PingenError)) return retryOrGiveUp(deps, rec, err);
    if (isAmbiguousFailure(err)) return flagAmbiguous(deps, rec, err);
    if (isRetryableHere(err)) return retryOrGiveUp(deps, rec, err);
    const failReason: FailReason = isAddressFailure(err) ? 'address' : 'other';
    await failSending(deps, rec, err.message, true, failReason, 'submitting');
    if (failReason === 'address') {
      const tenantId = rec.tenants[0] ?? '';
      if (shouldHoldVersand(await deps.countAddressFailures(rec.source))) await holdVersand(deps, rec.source, tenantId, isClearAddressFailure(err));
    }
    return;
  }
  if (letter.filePages !== rec.pages) {
    logger.warn('submit-sending: Pingen counts other pages than we charged, keeping ours', { id: rec.id, ours: rec.pages, pingen: letter.filePages });
  }
  // the cost first (idempotent set): a crash before the state write redoes both on the retry
  await deps.writeCost(rec.id, { providerPrice: Math.round(letter.priceValue * 100), currency: letter.priceCurrency });
  // the id whenever the record is not failed (a webhook may have moved it on), the state only out of `submitting`
  if (!(await deps.setProviderId(rec.id, letter.id))) {
    // Pingen produced a letter whose share a concurrent delivery already refunded: nothing may be lost silently
    await flagSentDespiteRefund(deps, rec, letter.id);
    return;
  }
  const at = deps.now().toISOString();
  await deps.updateSending(rec.id, { state: 'submitted', history: [...rec.history, { state: 'submitted', at }], updatedAt: at }, 'submitting');
  // a duplicate delivery may have opened «Briefstatus unklar» while this one succeeded
  try {
    await deps.closeOpenTask(`sending.${rec.id}`, rec.tenants[0] ?? '');
  } catch (err) {
    logger.error('submit-sending: open task not closed', { id: rec.id, error: err instanceof Error ? err.message : String(err) });
  }
}
