// apps/functions/src/pingen/reconcile.logic.ts
//
// The nightly reconcile of the Postversand (spec 1.150): no paid letter is left in limbo. The fan-out trigger
// (`onMailing`) and the submit trigger have no safety net of their own beyond their retries; this is it. Pure core:
// every effect is injected. Four independent parts, each bounded and each failing alone.
//
//   1. a Pingen Versand with fewer `sendings` than letters: the charged recipients without a record get a
//      tombstone and their share back (the fan-out's own `finish`), ONE task for the sender.
//   2. `queued` records the submit trigger never took: submitted from here, with the same guards.
//   3. `submitting` records without an answer: «Briefstatus unklar» (stays `submitting`, no refund).
//   4. `submitted` records Pingen never reported on for 7 days: one task, no state change.

import { logger } from 'firebase-functions/v2';
import { recipientParentKey } from '@okr/shared-util-core';
import { makePostFanOut, sendingId, type PostFanOutDeps } from '../email/mailing-sendings';
import type { MailingPost } from './post-order';
import { flagAmbiguous, submitSending, type SendingRow, type SubmitDeps } from './submit-sending.logic';

export const HOUR_MS = 3600 * 1000;
export const STALE_SUBMITTED_MS = 7 * 24 * HOUR_MS;
/** how far back a Versand is looked at: older orphans have been seen by a human long since */
export const MAILING_WINDOW_MS = 30 * 24 * HOUR_MS;
export const MAX_PER_PART = 100;

export interface ReconMailing {
  id: string;
  tenantId: string;
  senderKey: string;
  senderName: string;
  subject: string;
  post: MailingPost;
}

export interface ReconcileDeps extends SubmitDeps {
  /** Pingen Versand accepted between `sinceIso` and `beforeIso` (post.via 'pingen', letters > 0) */
  listPostMailings(sinceIso: string, beforeIso: string, limit: number): Promise<ReconMailing[]>;
  /** ids of every `sendings` record (any state, tombstones included) of the source */
  listSendingIds(source: string): Promise<string[]>;
  listByState(state: SendingRow['state'], limit: number): Promise<SendingRow[]>;
  /** a task of that key in ANY state: a closed one must not be reopened every night */
  hasAnyTask(relatedKey: string, tenantId: string): Promise<boolean>;
  fanOut: PostFanOutDeps;
}

export interface ReconcileCounts {
  mailingsChecked: number;
  mailingsRepaired: number;
  lettersReversed: number;
  queuedResubmitted: number;
  submittingFlagged: number;
  staleTasks: number;
}

const ms = (iso: string | undefined): number => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? t : NaN;
};
const olderThan = (iso: string | undefined, ageMs: number, nowMs: number): boolean => nowMs - ms(iso) > ageMs;
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Part 1. */
export async function repairIncompleteFanOuts(deps: ReconcileDeps, counts: ReconcileCounts): Promise<void> {
  const nowMs = deps.now().getTime();
  const mailings = await deps.listPostMailings(new Date(nowMs - MAILING_WINDOW_MS).toISOString(), new Date(nowMs - HOUR_MS).toISOString(), MAX_PER_PART * 5);
  for (const m of mailings) {
    counts.mailingsChecked++;
    try {
      const source = `mailing.${m.id}`;
      const existing = new Set(await deps.listSendingIds(source));
      if (existing.size >= m.post.letters) continue;
      const missing = [...new Set(m.post.recipients.map(recipientParentKey))].filter((pk) => !existing.has(sendingId(m.id, pk)));
      if (missing.length === 0) continue;
      // the fan-out's own finish(): tombstone first, then the keyed reversal, both idempotent across runs
      let tombstones = 0;
      const fan = makePostFanOut({
        tenantId: m.tenantId, mailingKey: m.id, post: m.post, nowIso: deps.now().toISOString(),
        deps: { ...deps.fanOut, create: async (id, doc) => { const created = await deps.fanOut.create(id, doc); if (created) tombstones++; return created; } },
      });
      if (fan.invalid) {
        logger.error(`post-reconcile: Versand ${m.id}: total is not a whole multiple of letters, nothing reversed, the operator decides`, { tenantId: m.tenantId });
        continue;
      }
      // the task first: a crash after it only repeats a deduped task, a crash before it would lose the news
      const relatedKey = `mailing.${m.id}.unbuilt`;
      if (!(await deps.hasOpenTask(relatedKey, m.senderKey, m.tenantId))) {
        await deps.createTask({
          tenantId: m.tenantId,
          name: `Versand ${m.subject}: ${missing.length === 1 ? '1 Brief konnte' : `${missing.length} Briefe konnten`} nicht erstellt werden — Betrag zurückerstattet`,
          assignee: await deps.avatar(m.senderKey, m.tenantId, m.senderName), dueInDays: 3,
          relatedModelType: 'mailing', relatedKey, notes: 'Beim Erstellen der Briefe ist etwas abgebrochen. Der Anteil der fehlenden Briefe ist dem Guthaben gutgeschrieben.',
        });
      }
      await fan.finish('letters were not built');
      if (tombstones > 0) counts.mailingsRepaired++;
      counts.lettersReversed += tombstones;
    } catch (err) {
      logger.error(`post-reconcile: Versand ${m.id} not repaired`, { tenantId: m.tenantId, error: msg(err) });
    }
  }
}

/** Part 2: the same submit core as the trigger, so every guard applies. */
export async function resubmitQueued(deps: ReconcileDeps, counts: ReconcileCounts): Promise<void> {
  const nowMs = deps.now().getTime();
  const due = (await deps.listByState('queued', MAX_PER_PART * 5)).filter((r) => olderThan(r.createdAt, HOUR_MS, nowMs)).slice(0, MAX_PER_PART);
  for (const r of due) {
    try {
      await submitSending(deps, r.id);
      counts.queuedResubmitted++;
    } catch (err) {
      // a retryable failure: the record is `submitting` now and stays so for the next run / part 3
      logger.warn(`post-reconcile: letter ${r.id} not submitted yet`, { tenantId: r.tenants[0], error: msg(err) });
    }
  }
}

/** Part 3: flagAmbiguous dedupes by its own open task. */
export async function flagStuckSubmitting(deps: ReconcileDeps, counts: ReconcileCounts): Promise<void> {
  const nowMs = deps.now().getTime();
  const due = (await deps.listByState('submitting', MAX_PER_PART * 5)).filter((r) => olderThan(r.updatedAt, HOUR_MS, nowMs)).slice(0, MAX_PER_PART);
  for (const r of due) {
    try {
      await flagAmbiguous(deps, r, { message: 'submitting for more than an hour without an answer' });
      counts.submittingFlagged++;
    } catch (err) {
      logger.error(`post-reconcile: letter ${r.id} not flagged`, { tenantId: r.tenants[0], error: msg(err) });
    }
  }
}

/** Part 4: no state change, one task per letter for ever (a closed task is not reopened). */
export async function flagSilentSubmitted(deps: ReconcileDeps, counts: ReconcileCounts): Promise<void> {
  const nowMs = deps.now().getTime();
  const due = (await deps.listByState('submitted', MAX_PER_PART * 10))
    .filter((r) => olderThan(r.updatedAt, STALE_SUBMITTED_MS, nowMs) && !r.history.some((h) => h.state === 'sent' || h.state === 'delivered' || h.state === 'undeliverable'))
    .slice(0, MAX_PER_PART);
  const mailings = new Map<string, Awaited<ReturnType<SubmitDeps['loadMailing']>>>();
  for (const r of due) {
    try {
      const tenantId = r.tenants[0] ?? '';
      if (!mailings.has(r.source)) mailings.set(r.source, await deps.loadMailing(r.source, tenantId));
      const mailing = mailings.get(r.source);
      if (!mailing) {
        logger.error('post-reconcile: no Versand for a silent letter, no task', { id: r.id, source: r.source });
        continue;
      }
      const relatedKey = `sending.${r.id}.stale`;
      if (await deps.hasAnyTask(relatedKey, tenantId)) continue;
      await deps.createTask({
        tenantId, name: `Brief an ${r.recipientName}: keine Rückmeldung von Pingen seit 7 Tagen`,
        assignee: await deps.avatar(mailing.senderKey, tenantId, mailing.senderName), dueInDays: 3,
        relatedModelType: 'sending', relatedKey, linkKey: r.source, notes: `Brief ${r.id}, Pingen ${r.providerId}`,
      });
      counts.staleTasks++;
    } catch (err) {
      logger.error(`post-reconcile: letter ${r.id} not flagged as silent`, { tenantId: r.tenants[0], error: msg(err) });
    }
  }
}

/** Runs the four parts in order; one part's failure is logged and the rest still run. */
export async function reconcilePostVersand(deps: ReconcileDeps): Promise<ReconcileCounts> {
  const counts: ReconcileCounts = { mailingsChecked: 0, mailingsRepaired: 0, lettersReversed: 0, queuedResubmitted: 0, submittingFlagged: 0, staleTasks: 0 };
  for (const [name, part] of [
    ['fan-outs', repairIncompleteFanOuts], ['queued', resubmitQueued], ['submitting', flagStuckSubmitting], ['silent', flagSilentSubmitted],
  ] as const) {
    try {
      await part(deps, counts);
    } catch (err) {
      logger.error(`post-reconcile: part ${name} failed`, { error: msg(err) });
    }
  }
  logger.info('post-reconcile: done', { ...counts });
  return counts;
}
