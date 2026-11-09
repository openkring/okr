// apps/functions/src/pingen/reconcile.logic.ts
//
// The nightly reconcile of the Postversand (spec 1.150): no paid letter is left in limbo. The fan-out trigger
// (`onMailing`) and the submit trigger have no safety net of their own beyond their retries; this is it. Pure core:
// every effect is injected. Five independent parts, each bounded and each failing alone, all under one time budget
// (RECONCILE_BUDGET_MS: the reconcile shares the nightly slot, so it stops starting new work and logs what is left).
//
//   0. a `post-orders` lock left `pending` for more than an hour (the callable died between the deduction and the
//      mailing doc): no mailing doc = the WHOLE deduction back, lock `failed`; a mailing doc = lock `done`.
//   1. a Pingen Versand with fewer `sendings` than letters: the charged recipients without a record get a
//      tombstone and their share back (the fan-out's own `finish`), ONE task for the sender. Tombstones that
//      already exist get their keyed reversal again (a crash between tombstone and reversal lost it; the ledger
//      answers a duplicate for every other one).
//   2. `queued` records the submit trigger never took: submitted from here, with the same guards.
//   3. `submitting` records without an answer: «Briefstatus unklar» (stays `submitting`, no refund).
//   4. `submitted` records Pingen never reported on for 7 days: one task, no state change.

import { logger } from 'firebase-functions/v2';
import { convertDateFormatToString, DateFormat, recipientParentKey, subDuration } from '@okr/shared-util-core';
import { makePostFanOut, sendingId, TOMBSTONE_DETAIL, type PostFanOutDeps } from '../email/mailing-sendings';
import type { MailingPost } from './post-order';
import { flagAmbiguous, submitSending, type SendingRow, type SubmitDeps } from './submit-sending.logic';

export const HOUR_MS = 3600 * 1000;
export const STALE_SUBMITTED_MS = 7 * 24 * HOUR_MS;
/** how far back a Versand is looked at: older orphans have been seen by a human long since */
export const MAILING_WINDOW_MS = 30 * 24 * HOUR_MS;
export const MAX_PER_PART = 100;
/** what one query reads; a part acts on at most MAX_PER_PART of it, AFTER dropping what is already handled */
export const QUERY_LIMIT = 500;
/** the share of the nightly slot (540 s, shared with a dozen jobs) the reconcile may take */
export const RECONCILE_BUDGET_MS = 120_000;

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
  /** every `sendings` record (any state, tombstones included) of the source, reduced to what part 1 reads */
  listSendings(source: string): Promise<Array<Pick<SendingRow, 'id' | 'state' | 'history'>>>;
  /** `post-orders` locks in state `pending` (any age) */
  listPendingPostOrders(limit: number): Promise<PendingPostOrder[]>;
  mailingExists(mailingKey: string): Promise<boolean>;
  setPostOrderState(mailingKey: string, state: 'done' | 'failed'): Promise<void>;
  listByState(state: SendingRow['state'], limit: number): Promise<SendingRow[]>;
  /** a task of that key in ANY state: a closed one must not be reopened every night */
  hasAnyTask(relatedKey: string, tenantId: string): Promise<boolean>;
  fanOut: PostFanOutDeps;
}

/** A `post-orders/{mailingKey}` lock as part 0 reads it; `letters`/`pages` are missing on locks from before 1.150's fix. */
export interface PendingPostOrder {
  id: string;
  tenantId: string;
  createdAt: string;
  letters?: number;
  pages?: number;
}

export interface ReconcileCounts {
  /** stale locks: whole deduction reversed / lock set failed / lock set done (the mailing exists) */
  ordersReversed: number;
  ordersFailed: number;
  ordersDone: number;
  mailingsChecked: number;
  mailingsRepaired: number;
  lettersReversed: number;
  queuedResubmitted: number;
  /** `submitting` letters Pingen was never reached for, sent through the submit core again */
  submittingResubmitted: number;
  submittingFlagged: number;
  staleTasks: number;
  /** tombstones whose lost reversal was booked now (the ledger did not answer duplicate) */
  tombstonesRefunded: number;
  /** items not started because the time budget was used up; the next run takes them */
  leftForNextRun: number;
}

/** One run: the counts and the time budget. */
export interface ReconcileRun {
  counts: ReconcileCounts;
  /** true once the budget is used up: no new submit or reversal is started */
  over(): boolean;
  /** records `n` items of `part` left for the next run */
  leave(part: string, n: number): void;
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

const errorCode = (e: unknown): unknown => (e as { code?: unknown } | null)?.code;

/**
 * Part 0. A lock older than an hour is dead (the callable runs at most 120 s). Its mailing doc decides: there = the
 * order went through (`done`); missing = the deduction, if it committed, is reversed in whole under the same key
 * withPostOrder's own rollback uses (`mailing.<id>-undo`, so the two can never both book), then `failed`. A missing
 * deduction entry means nothing was charged: logged, `failed` all the same. Any other ledger error keeps the lock
 * `pending` for the next run.
 */
export async function settleStalePostOrders(deps: ReconcileDeps, run: ReconcileRun): Promise<void> {
  const { counts } = run;
  const nowMs = deps.now().getTime();
  const all = await deps.listPendingPostOrders(QUERY_LIMIT);
  if (all.length >= QUERY_LIMIT) logger.warn(`post-reconcile: ${all.length} pending post orders: the limit is hit, later ones wait for the next run`);
  const stale = all.filter((o) => olderThan(o.createdAt, HOUR_MS, nowMs)).slice(0, MAX_PER_PART);
  for (const [i, o] of stale.entries()) {
    if (run.over()) { run.leave('orders', stale.length - i); break; }
    try {
      if (await deps.mailingExists(o.id)) {
        await deps.setPostOrderState(o.id, 'done');
        counts.ordersDone++;
        continue;
      }
      const { letters, pages } = o;
      if (!o.tenantId || !Number.isInteger(letters) || !Number.isInteger(pages) || (letters ?? 0) <= 0 || (pages ?? -1) < 0) {
        logger.error('post-reconcile: stale post order is a legacy lock without letters/pages, reverse by hand', { id: o.id, tenantId: o.tenantId, entryId: `deduct-mailing.${o.id}` });
        continue;
      }
      try {
        await deps.reverseShare(o.tenantId, `deduct-mailing.${o.id}`, { units: letters as number, pages: pages as number }, `mailing.${o.id}-undo`, 'Versand nicht gespeichert');
        counts.ordersReversed++;
      } catch (err) {
        if (errorCode(err) !== 'not-found') throw err;
        logger.warn('post-reconcile: stale post order without a deduction entry, nothing to reverse', { id: o.id, tenantId: o.tenantId });
      }
      await deps.setPostOrderState(o.id, 'failed');
      counts.ordersFailed++;
    } catch (err) {
      logger.error(`post-reconcile: stale post order ${o.id} not settled, next run`, { tenantId: o.tenantId, error: msg(err) });
    }
  }
}

const isTombstone = (r: Pick<SendingRow, 'state' | 'history'>): boolean => r.state === 'failed' && r.history.some((h) => h.detail === TOMBSTONE_DETAIL);

/** Part 1b: the keyed reversal of each existing tombstone again; the ledger books only a lost one. Never throws. */
async function reissueTombstoneReversals(deps: ReconcileDeps, run: ReconcileRun, m: ReconMailing, records: Array<Pick<SendingRow, 'id' | 'state' | 'history'>>): Promise<boolean> {
  const tombstones = records.filter(isTombstone);
  if (tombstones.length === 0) return true;
  if (!Number.isInteger(m.post.total / m.post.letters)) return true;   // the fan-out never reversed either; logged there
  const pages = m.post.pages / m.post.letters;
  for (const [i, t] of tombstones.entries()) {
    if (run.over()) { run.leave('tombstones', tombstones.length - i); return false; }
    try {
      const r = await deps.fanOut.reverseShare(m.tenantId, m.post.creditEntryId, { units: 1, pages }, t.id, `Versand ${m.id}: letters were not built`);
      if (!r.duplicate) {
        run.counts.tombstonesRefunded++;
        logger.warn('post-reconcile: a tombstone\'s lost reversal is booked now', { id: t.id, tenantId: m.tenantId });
      }
    } catch (err) {
      logger.error('post-reconcile: tombstone reversal failed, next run', { id: t.id, tenantId: m.tenantId, error: msg(err) });
    }
  }
  return true;
}

/** Part 1. */
export async function repairIncompleteFanOuts(deps: ReconcileDeps, run: ReconcileRun): Promise<void> {
  const { counts } = run;
  const { since, before } = acceptedAtWindow(deps.now());
  const mailings = await deps.listPostMailings(since, before, QUERY_LIMIT);
  if (mailings.length >= QUERY_LIMIT) logger.warn(`post-reconcile: ${mailings.length} Versand in the last 30 days: the limit is hit, older ones may not be checked`);
  for (const [i, m] of mailings.entries()) {
    if (run.over()) { run.leave('fan-outs', mailings.length - i); break; }
    counts.mailingsChecked++;
    try {
      const source = `mailing.${m.id}`;
      const records = await deps.listSendings(source);
      if (!(await reissueTombstoneReversals(deps, run, m, records))) break;
      const existing = new Set(records.map((r) => r.id));
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
export async function resubmitQueued(deps: ReconcileDeps, run: ReconcileRun): Promise<void> {
  const { counts } = run;
  const nowMs = deps.now().getTime();
  const all = await listState(deps, 'queued');
  const due = all.filter((r) => olderThan(r.createdAt, HOUR_MS, nowMs)).slice(0, MAX_PER_PART);
  for (const [i, r] of due.entries()) {
    if (run.over()) { run.leave('queued', due.length - i); break; }
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
export async function flagStuckSubmitting(deps: ReconcileDeps, run: ReconcileRun): Promise<void> {
  const { counts } = run;
  const nowMs = deps.now().getTime();
  const stuck = (await listState(deps, 'submitting')).filter((r) => olderThan(r.updatedAt, HOUR_MS, nowMs));
  const unreached = stuck.filter((r) => !r.attemptedAt).slice(0, MAX_PER_PART);
  for (const [i, r] of unreached.entries()) {
    if (run.over()) { run.leave('submitting', unreached.length - i); break; }
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
  for (const [i, r] of open.entries()) {
    if (run.over()) { run.leave('submitting-unclear', open.length - i); break; }
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
export async function flagSilentSubmitted(deps: ReconcileDeps, run: ReconcileRun): Promise<void> {
  const { counts } = run;
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
  for (const [i, r] of due.entries()) {
    if (run.over()) { run.leave('silent', due.length - i); break; }
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

/**
 * Runs the five parts in order; one part's failure is logged and the rest still run. Past RECONCILE_BUDGET_MS (by
 * the injected clock) no part starts a new item; what was left is logged and taken by the next night.
 */
export async function reconcilePostVersand(deps: ReconcileDeps): Promise<ReconcileCounts> {
  const counts: ReconcileCounts = {
    ordersReversed: 0, ordersFailed: 0, ordersDone: 0, mailingsChecked: 0, mailingsRepaired: 0, lettersReversed: 0, queuedResubmitted: 0,
    submittingResubmitted: 0, submittingFlagged: 0, staleTasks: 0, tombstonesRefunded: 0, leftForNextRun: 0,
  };
  const startMs = deps.now().getTime();
  const left: Record<string, number> = {};
  const run: ReconcileRun = {
    counts,
    over: () => deps.now().getTime() - startMs >= RECONCILE_BUDGET_MS,
    leave: (part, n) => { left[part] = (left[part] ?? 0) + n; counts.leftForNextRun += n; },
  };
  for (const [name, part] of [
    ['orders', settleStalePostOrders], ['fan-outs', repairIncompleteFanOuts], ['queued', resubmitQueued], ['submitting', flagStuckSubmitting], ['silent', flagSilentSubmitted],
  ] as const) {
    try {
      await part(deps, run);
    } catch (err) {
      logger.error(`post-reconcile: part ${name} failed`, { error: msg(err) });
    }
  }
  if (counts.leftForNextRun > 0) logger.warn('post-reconcile: time budget used up, the rest waits for the next run', left);
  logger.info('post-reconcile: done', { ...counts });
  return counts;
}
