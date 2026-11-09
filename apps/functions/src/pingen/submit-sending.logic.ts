// apps/functions/src/pingen/submit-sending.logic.ts
//
// Handing one queued `sendings` record to Pingen (spec 1.150) and the fallback when Pingen refuses it. Pure core:
// every effect (Pingen, Storage, Firestore, tasks, the credit port, the clock) is injected, so the tests touch
// none of them. The production wiring and the trigger are in submit-sending.ts.
//
// Exactly-once: the model has no "submitting" state, so there is no claim step. The record id is Pingen's
// `Idempotency-Key`: a retried trigger (or a crash between Pingen's answer and our write) calls createLetter with
// the same key and gets the SAME Pingen letter back, never a second one. A record that is no longer `queued`
// (a retry after success, a tombstone) is returned from untouched.

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
  loadMailing(source: string, tenantId: string): Promise<SendingMailing | undefined>;
  countAddressFailures(source: string): Promise<number>;
  listQueued(source: string): Promise<SendingRow[]>;
  avatar(personKey: string, tenantId: string, fallbackName: string): Promise<AvatarInfo>;
  hasOpenTask(relatedKey: string, assigneeKey: string, tenantId: string): Promise<boolean>;
  createTask(task: SubmitTask): Promise<void>;
  reverseShare(tenantId: string, entryId: string, part: { units: number; pages: number }, key: string, reason: string): Promise<{ amount: number; duplicate: boolean }>;
  now(): Date;
}

export type FailReason = 'address' | 'other';

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
async function reverse(deps: SubmitDeps, rec: SendingRow, mailing: SendingMailing | undefined, reason: string): Promise<void> {
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
export async function failSending(deps: SubmitDeps, record: SendingRow, reason: string, reverseShare: boolean, failReason: FailReason = 'other'): Promise<void> {
  const tenantId = record.tenants[0] ?? '';
  const at = deps.now().toISOString();
  await deps.updateSending(record.id, patchFailed(record, reason, failReason, at));
  let mailing: SendingMailing | undefined;
  try {
    mailing = await deps.loadMailing(record.source, tenantId);
  } catch (err) {
    logger.error('submit-sending: mailing unreadable', { id: record.id, error: err instanceof Error ? err.message : String(err) });
  }
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
  if (reverseShare) await reverse(deps, record, mailing, `Brief ${record.id}: ${reason}`);
}

/**
 * Every remaining queued letter of the Versand becomes failed ('other'), its share reversed, and ONE task opens for
 * the whole Versand. Idempotent: the task is looked up before it is created, and each record is claimed with
 * expectState 'queued', so a second failure (or a concurrent instance) neither re-holds nor reverses twice.
 */
async function holdVersand(deps: SubmitDeps, source: string, tenantId: string): Promise<void> {
  const queued = await deps.listQueued(source);
  if (queued.length === 0) return;
  const mailing = await deps.loadMailing(source, tenantId);
  if (mailing) {
    const relatedKey = `mailing.${sourceKey(source)}`;
    try {
      // before the records change: a second run that still finds queued letters sees the task
      if (!(await deps.hasOpenTask(relatedKey, mailing.senderKey, tenantId))) {
        await deps.createTask({
          tenantId, name: `Versand ${mailing.subject}: Briefe angehalten — Adressen prüfen`,
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

/** Submits one `sendings` record. Throws only when a retry can help (retryable Pingen error, Storage failure). */
export async function submitSending(deps: SubmitDeps, id: string): Promise<void> {
  const rec = await deps.getSending(id);
  if (!rec || rec.state !== 'queued') return;   // tombstone, or a retry after success
  const pdf = await deps.readPdf(rec.storagePath);   // a Storage failure rethrows: retry
  let letter;
  try {
    letter = await deps.client.createLetter({ pdf, fileName: sendingFileName(deps.env, rec.id, rec.recipientName), options: rec.options, idempotencyKey: rec.id });
  } catch (err) {
    if (err instanceof PingenError && !err.retryable) {
      const failReason: FailReason = isAddressFailure(err) ? 'address' : 'other';
      await failSending(deps, rec, err.message, true, failReason);
      if (failReason === 'address') {
        const tenantId = rec.tenants[0] ?? '';
        if (shouldHoldVersand(await deps.countAddressFailures(rec.source))) await holdVersand(deps, rec.source, tenantId);
      }
      return;
    }
    throw err;   // retryable, or not a Pingen error at all: the trigger retries with the same Idempotency-Key
  }
  if (letter.filePages !== rec.pages) {
    logger.warn('submit-sending: Pingen counts other pages than we charged, keeping ours', { id: rec.id, ours: rec.pages, pingen: letter.filePages });
  }
  const at = deps.now().toISOString();
  await deps.updateSending(rec.id, { state: 'submitted', providerId: letter.id, history: [...rec.history, { state: 'submitted', at }], updatedAt: at });
  await deps.writeCost(rec.id, { providerPrice: Math.round(letter.priceValue * 100), currency: letter.priceCurrency });
}
