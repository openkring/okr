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
import { convertDateFormatToString, DateFormat, recipientParentKey, subDuration } from '@okr/shared-util-core';
import { makePostFanOut, sendingId, type PostFanOutDeps } from '../email/mailing-sendings';
import type { MailingPost } from './post-order';
import { flagAmbiguous, submitSending, type SendingRow, type SubmitDeps } from './submit-sending.logic';

export const HOUR_MS = 3600 * 1000;
export const STALE_SUBMITTED_MS = 7 * 24 * HOUR_MS;
/** how far back a Versand is looked at: older orphans have been seen by a human long since */
export const MAILING_WINDOW_MS = 30 * 24 * HOUR_MS;
export const MAX_PER_PART = 100;
/** what one query reads; a part acts on at most MAX_PER_PART of it, AFTER dropping what is already handled */
export const QUERY_LIMIT = 500;

export interface ReconMailing {
  id: string;
  tenantId: string;
  senderKey: string;
  senderName: string;
  subject: string;
  post: MailingPost;
}

export interface ReconcileDeps extends SubmitDeps {
  /**
   * Pingen Versand accepted between `since` and `before` (post.via 'pingen', letters > 0). Both bounds are
   * StoreDateTime (`yyyyMMddHHmmss`), the format `sendMailing` writes into `post.acceptedAt`.
   */
  listPostMailings(since: string, before: string, limit: number): Promise<ReconMailing[]>;
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
  /** `submitting` letters Pingen was never reached for, sent through the submit core again */
  submittingResubmitted: number;
  submittingFlagged: number;
  staleTasks: number;
}

const ms = (iso: string | undefined): number => {
  const t = Date.parse(iso ?? '');
  return Number.isFinite(t) ? t : NaN;
};
const olderThan = (iso: string | undefined, ageMs: number, nowMs: number): boolean => nowMs - ms(iso) > ageMs;
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * `now` as StoreDateTime in the process's local wall clock, the clock `getTodayStr(DateFormat.StoreDateTime)` writes
 * `post.acceptedAt` with. `Date.prototype.toString()` starts with `Www Mmm DD YYYY HH:mm:ss` (ECMA-262), which is
 * DateFormat.DateTime.
 */
export function storeDateTimeOf(now: Date): string {
  return convertDateFormatToString(now.toString().slice(0, 24), DateFormat.DateTime, DateFormat.StoreDateTime);
}

/** The `post.acceptedAt` range part 1 looks at: from 30 days ago up to one hour ago, both StoreDateTime. */
export function acceptedAtWindow(now: Date): { since: string; before: string } {
  const nowStr = storeDateTimeOf(now);
  return {
    since: subDuration(nowStr, { seconds: MAILING_WINDOW_MS / 1000 }, DateFormat.StoreDateTime),
    before: subDuration(nowStr, { seconds: HOUR_MS / 1000 }, DateFormat.StoreDateTime),
  };
}

/** Part 1. */
export async function repairIncompleteFanOuts(deps: ReconcileDeps, counts: ReconcileCounts): Promise<void> {
  const { since, before } = acceptedAtWindow(deps.now());
  const mailings = await deps.listPostMailings(since, before, QUERY_LIMIT);
  if (mailings.length >= QUERY_LIMIT) logger.warn(`post-reconcile: ${mailings.length} Versand in the last 30 days: the limit is hit, older ones may not be checked`);
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
      let reversed = 0;
      const fan = makePostFanOut({
        tenantId: m.tenantId, mailingKey: m.id, post: m.post, nowIso: deps.now().toISOString(),
        deps: {
          ...deps.fanOut,
          create: async (id, doc) => { const created = await deps.fanOut.create(id, doc); if (created) tombstones++; return created; },
          reverseShare: async (...args) => { const r = await deps.fanOut.reverseShare(...args); reversed++; return r; },
        },
      });
      if (fan.invalid) {
        logger.error(`post-reconcile: Versand ${m.id}: total is not a whole multiple of letters, nothing reversed, the operator decides`, { tenantId: m.tenantId });
        continue;
      }
      await fan.finish('letters were not built');
      counts.lettersReversed += reversed;
      if (tombstones === 0) continue;   // a concurrent run or the fan-out itself got there first
      counts.mailingsRepaired++;
      // the task tells what really happened (finish() swallows a failed reversal into a log line)
      const relatedKey = `mailing.${m.id}.unbuilt`;
      if (!(await deps.hasOpenTask(relatedKey, m.senderKey, m.tenantId))) {
        const what = tombstones === 1 ? '1 Brief konnte' : `${tombstones} Briefe konnten`;
        const refunded = reversed >= tombstones;
        await deps.createTask({
          tenantId: m.tenantId,
          name: `Versand ${m.subject}: ${what} nicht erstellt werden — ${refunded ? 'Betrag zurückerstattet' : 'Rückerstattung wird geprüft'}`,
          assignee: await deps.avatar(m.senderKey, m.tenantId, m.senderName), dueInDays: 3,
          relatedModelType: 'mailing', relatedKey,
          notes: refunded ? 'Beim Erstellen der Briefe ist etwas abgebrochen. Der Anteil der fehlenden Briefe ist dem Guthaben gutgeschrieben.'
            : 'Beim Erstellen der Briefe ist etwas abgebrochen. Die Rückerstattung konnte nicht sicher gebucht werden und wird geprüft.',
        });
      }
    } catch (err) {
      logger.error(`post-reconcile: Versand ${m.id} not repaired`, { tenantId: m.tenantId, error: msg(err) });
    }
  }
}

/** Part 2: the same submit core as the trigger, so every guard applies. */
export async function resubmitQueued(deps: ReconcileDeps, counts: ReconcileCounts): Promise<void> {
  const nowMs = deps.now().getTime();
  const all = await listState(deps, 'queued');
  const due = all.filter((r) => olderThan(r.createdAt, HOUR_MS, nowMs)).slice(0, MAX_PER_PART);
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

async function listState(deps: ReconcileDeps, state: SendingRow['state']): Promise<SendingRow[]> {
  const rows = await deps.listByState(state, QUERY_LIMIT);
  if (rows.length >= QUERY_LIMIT) logger.warn(`post-reconcile: ${rows.length} letters in state ${state}: the limit is hit, later ones wait for the next run`);
  return rows;
}

/**
 * Part 3. Without `attemptedAt` Pingen was certainly never reached (the PDF read failed): back through the submit core,
 * whose 24 h rule refunds it. With `attemptedAt` Pingen may hold the letter: «Briefstatus unklar», never a refund.
 * Records that already carry that task are dropped BEFORE the bound, or the same hundred would come back every night.
 */
export async function flagStuckSubmitting(deps: ReconcileDeps, counts: ReconcileCounts): Promise<void> {
  const nowMs = deps.now().getTime();
  const stuck = (await listState(deps, 'submitting')).filter((r) => olderThan(r.updatedAt, HOUR_MS, nowMs));
  const unreached = stuck.filter((r) => !r.attemptedAt).slice(0, MAX_PER_PART);
  for (const r of unreached) {
    try {
      await submitSending(deps, r.id);
      counts.submittingResubmitted++;
    } catch (err) {
      logger.warn(`post-reconcile: letter ${r.id} not submitted yet`, { tenantId: r.tenants[0], error: msg(err) });
    }
  }
  const open: SendingRow[] = [];
  for (const r of stuck.filter((x) => !!x.attemptedAt)) {
    if (open.length >= MAX_PER_PART) break;
    try {
      if (!(await deps.hasAnyTask(`sending.${r.id}`, r.tenants[0] ?? ''))) open.push(r);
    } catch (err) {
      logger.error(`post-reconcile: task lookup for letter ${r.id} failed`, { error: msg(err) });
    }
  }
  for (const r of open) {
    try {
      await flagAmbiguous(deps, r, { message: 'submitting for more than an hour without an answer' });
      if (await deps.hasAnyTask(`sending.${r.id}`, r.tenants[0] ?? '')) counts.submittingFlagged++;
    } catch (err) {
      logger.error(`post-reconcile: letter ${r.id} not flagged`, { tenantId: r.tenants[0], error: msg(err) });
    }
  }
}

/**
 * Part 4: no state change, one task per letter for ever (a closed task is not reopened). A letter Pingen reported on
 * (sent, delivered, undeliverable, or an `issues` event: any history entry with a detail, or an issue task) is not silent.
 */
export async function flagSilentSubmitted(deps: ReconcileDeps, counts: ReconcileCounts): Promise<void> {
  const nowMs = deps.now().getTime();
  const candidates = (await listState(deps, 'submitted')).filter((r) => olderThan(r.updatedAt, STALE_SUBMITTED_MS, nowMs)
    && !r.history.some((h) => h.state === 'sent' || h.state === 'delivered' || h.state === 'undeliverable' || !!h.detail));
  const due: SendingRow[] = [];
  for (const r of candidates) {
    if (due.length >= MAX_PER_PART) break;
    try {
      const tenantId = r.tenants[0] ?? '';
      if (await deps.hasAnyTask(`sending.${r.id}.stale`, tenantId)) continue;
      if (await deps.hasAnyTask(`sending.${r.id}.issue`, tenantId)) continue;
      due.push(r);
    } catch (err) {
      logger.error(`post-reconcile: task lookup for letter ${r.id} failed`, { error: msg(err) });
    }
  }
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
      await deps.createTask({
        tenantId, name: `Brief an ${r.recipientName}: keine Rückmeldung von Pingen seit 7 Tagen`,
        assignee: await deps.avatar(mailing.senderKey, tenantId, mailing.senderName), dueInDays: 3,
        relatedModelType: 'sending', relatedKey: `sending.${r.id}.stale`, linkKey: r.source, notes: `Brief ${r.id}, Pingen ${r.providerId}`,
      });
      counts.staleTasks++;
    } catch (err) {
      logger.error(`post-reconcile: letter ${r.id} not flagged as silent`, { tenantId: r.tenants[0], error: msg(err) });
    }
  }
}

/** Runs the four parts in order; one part's failure is logged and the rest still run. */
export async function reconcilePostVersand(deps: ReconcileDeps): Promise<ReconcileCounts> {
  const counts: ReconcileCounts = { mailingsChecked: 0, mailingsRepaired: 0, lettersReversed: 0, queuedResubmitted: 0, submittingResubmitted: 0, submittingFlagged: 0, staleTasks: 0 };
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
