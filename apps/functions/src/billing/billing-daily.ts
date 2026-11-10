// apps/functions/src/billing/billing-daily.ts
//
// The daily billing job (plan 2 Task 5, design §7.4; MORNING_JOBS, every day) and the state part of the paid trigger.
// Per subscription with billing 'stripe', over its open subscription invoices in the operator books:
//
// 1. Retries: a declined monthly charge (attempt `auto-<invoiceKey>`, Task 4) is charged again on day 3, 7 and 14
//    after the invoice date (retryCount 1..3). Stripe's idempotency keys expire after 24 h, so before each re-charge
//    the earlier PaymentIntent is read back (collection/charge-readback.ts): succeeded → settled through the
//    webhook's path, no charge; in flight → wait (tomorrow again); else charged with key `<invoiceKey>-r<n>`. Every
//    failure mails the tenant (attempt n+1, deterministic id). After the third retry: no more charges — the
//    reminder run (Mahnlauf) treats the invoice like any open one. A paid invoice (e.g. by QR bill) is no longer
//    open, so it is never charged again.
// 2. Events: a failed charge on an open invoice → chargeFailed; an open invoice past its due date →
//    dueDatePassedUnpaid; no open invoice → allPaid; then the day itself (30-day transitions).
// 3. State: decided and written in a transaction that re-reads the open invoices; entering pastDue / closing queues
//    its mail before the state commits (applyBillingEvents).
//
// `cancelled` and `closed` never change by events, and their invoices are not charged again.
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { InvoiceCollection, PaymentAttemptCollection, SubscriptionCollection } from '@okr/shared-models';
import type { SavedPaymentMethod, SubscriptionState } from '@okr/shared-models';
import { addDuration } from '@okr/shared-util-core';

import { readBackEarlierCharge } from '../collection/charge-readback';
import type { ReadBackPort } from '../collection/charge-readback';
import { platformBilling } from '../collection/platform';
import { stripePort } from '../collection/stripe-port';
import type { StripePort } from '../collection/stripe-port';
import { isPayableState, openAmount } from '../invoice/invoice-payment.logic';
import type { InvoiceLike } from '../invoice/invoice-payment.logic';
import { toStoreDate, toStoreDateTime } from '../srv/zurich-time';
import { notifyChargeFailed, notifyClosing, notifyPastDue } from './billing-mail';
import { applyEvents, nextRetryDate, RETRY_DAYS } from './billing-state.logic';
import type { BillingEvent, BillingStateFields } from './billing-state.logic';
import type { Log } from './billing-run';

export type BillingDailyPort = Pick<StripePort, 'chargeOffSession'> & ReadBackPort;

type Doc = Record<string, unknown>;
interface OpenInvoice { key: string; data: Doc }

/** Statuses of an off-session PaymentIntent after which the money is (or will be) on its way; the webhook records it. */
const CHARGE_ON_ITS_WAY = ['succeeded', 'processing'];
const SETTLED_ATTEMPT_STATES = ['succeeded', 'overpaid'];
/** Attempt states a due retry picks up: declined, or charged but not (yet) recorded — the read-back decides. */
const RETRYABLE_ATTEMPT_STATES = ['failed', 'open'];
/** States whose invoices are no longer charged; the state machine leaves them alone too. */
const FINAL_STATES: readonly SubscriptionState[] = ['cancelled', 'closed'];

const defaultLog: Log = (level, message, data) => logger[level](message, data);

const openQuery = (db: Firestore, tenantId: string, accountingTenantId: string) => db.collection(InvoiceCollection)
  .where('receiver.key', '==', tenantId).where('billingKind', '==', 'subscription').where('accountingTenantId', '==', accountingTenantId);

/** Issued and payable (pending / partial / unpaid; not draft, paid, cancelled or archived), sorted by key. */
const openOf = (docs: readonly { id: string; data(): unknown }[]): OpenInvoice[] => docs
  .map((d) => ({ key: d.id, data: (d.data() ?? {}) as Doc }))
  .filter((i) => i.data['isArchived'] !== true && isPayableState(String(i.data['state'] ?? '')))
  .sort((a, b) => a.key.localeCompare(b.key));

/** The tenant's open monthly invoices in the operator books, sorted by key. */
export async function openSubscriptionInvoices(db: Firestore, tenantId: string, accountingTenantId: string): Promise<OpenInvoice[]> {
  return openOf((await openQuery(db, tenantId, accountingTenantId).get()).docs);
}

const fieldsOf = (sub: Doc): BillingStateFields => ({
  state: (sub['state'] as SubscriptionState | undefined) ?? 'active',
  pastDueSince: String(sub['pastDueSince'] ?? ''),
  closingSince: String(sub['closingSince'] ?? ''),
});

const changed = (a: BillingStateFields, b: BillingStateFields): boolean =>
  a.state !== b.state || a.pastDueSince !== b.pastDueSince || a.closingSince !== b.closingSince;

/** The facts the events are decided from: the subscription and its open invoices, read together. */
type EventsOf = (open: readonly OpenInvoice[]) => BillingEvent[];

/**
 * Decides the events from the tenant's open subscription invoices and applies them to the subscription.
 *
 * 1. Preview (plain reads): the state the events would lead to. Entering pastDue or closing queues its mail FIRST
 *    (deterministic id per date, so a repeat is a no-op): a failing queue leaves the state unchanged and the next
 *    run tries both again — the mail is never lost behind a committed state.
 * 2. Transaction: the open invoices are re-queried inside it (an invoice paid meanwhile, e.g. by the webhook of a
 *    retry charged a moment ago, conflicts and re-runs the decision), the state re-computed and written. A
 *    transition into pastDue / closing whose mail the preview did not queue is not committed (the next run does both).
 */
export async function applyBillingEvents(
  db: Firestore, tenantId: string, accountingTenantId: string, eventsOf: EventsOf, log: Log,
): Promise<{ before: BillingStateFields; after: BillingStateFields }> {
  const ref = db.collection(SubscriptionCollection).doc(tenantId);
  const query = openQuery(db, tenantId, accountingTenantId);

  const previewOpen = openOf((await query.get()).docs);
  const previewBefore = fieldsOf((await ref.get()).data() ?? {});
  const preview = applyEvents(previewBefore, eventsOf(previewOpen));
  const mailed = new Set<string>();
  const keys = previewOpen.map((i) => i.key);
  if (preview.state === 'pastDue' && previewBefore.state !== 'pastDue') {
    await notifyPastDue(db, tenantId, { invoiceKeys: keys, pastDueSince: preview.pastDueSince });
    mailed.add(`pastDue:${preview.pastDueSince}`);
  }
  if (preview.state === 'closing' && previewBefore.state !== 'closing') {
    await notifyClosing(db, tenantId, { closingSince: preview.closingSince, invoiceKeys: keys });
    mailed.add(`closing:${preview.closingSince}`);
  }

  const { before, after } = await db.runTransaction(async (tx) => {
    const before = fieldsOf((await tx.get(ref)).data() ?? {});
    const open = openOf((await tx.get(query)).docs);
    let after = applyEvents(before, eventsOf(open));
    const entered = after.state !== before.state && (after.state === 'pastDue' || after.state === 'closing');
    const mailKey = after.state === 'pastDue' ? `pastDue:${after.pastDueSince}` : `closing:${after.closingSince}`;
    if (entered && !mailed.has(mailKey)) after = before; // its mail is not queued: the next run does both
    if (changed(before, after)) {
      tx.update(ref, { state: after.state, pastDueSince: after.pastDueSince, closingSince: after.closingSince });
    }
    return { before, after };
  });
  if (after.state !== before.state) log('info', `billing: ${tenantId} ${before.state} → ${after.state}`, { tenantId });
  return { before, after };
}

type RetryOutcome = 'none' | 'waiting' | 'settled' | 'charged' | 'declined';

/** Days after the third (last) retry was charged until its read-back-only pass (a lost webhook is settled then). */
const LAST_READBACK_DAYS = 3;

/**
 * The day after `n` retries: the planned day, but never today or earlier (a run on a missed day must not leave a
 * retry due again the same day). After the third retry: a declined one has none (''); a charged one gets a
 * read-back-only pass in LAST_READBACK_DAYS days.
 */
function retryDayAfter(issueDate: string, n: number, today: string, charged: boolean): string {
  if (n >= RETRY_DAYS.length) return charged ? addDuration(today, { days: LAST_READBACK_DAYS }) : '';
  const planned = issueDate ? nextRetryDate(issueDate, n) : '';
  const tomorrow = addDuration(today, { days: 1 });
  return planned > tomorrow ? planned : tomorrow;
}

/**
 * The due retry of one open invoice, if any. `failed` = its automatic charge stands declined afterwards (the
 * chargeFailed event); `inFlight` = money may be on its way (charged or waiting today): the invoice is not overdue.
 * After the third retry a due day only reads back (settles a succeeded charge), it never charges.
 */
async function retryInvoice(
  db: Firestore, port: () => BillingDailyPort, tenantId: string, sub: Doc, inv: OpenInvoice, today: string, mayCharge: boolean, log: Log,
): Promise<{ outcome: RetryOutcome; failed: boolean; inFlight: boolean }> {
  const attemptRef = db.collection(PaymentAttemptCollection).doc(`auto-${inv.key}`);
  const attempt = (await attemptRef.get()).data();
  if (!attempt) return { outcome: 'none', failed: false, inFlight: false };
  const failed = attempt['state'] === 'failed';
  const none = { outcome: 'none' as const, failed, inFlight: false };
  const retriesDone = Number(attempt['retryCount'] ?? 0);
  const due = String(attempt['nextRetryAt'] ?? '');
  if (!mayCharge || !RETRYABLE_ATTEMPT_STATES.includes(String(attempt['state'])) || !due || due > today) return none;
  const readBackOnly = retriesDone >= RETRY_DAYS.length;
  const method = sub['paymentMethod'] as SavedPaymentMethod | null | undefined;
  const customerId = String(sub['stripeCustomerId'] ?? '');
  if (!readBackOnly && (sub['autopay'] !== true || !method?.stripePaymentMethodId || !customerId)) {
    log('info', 'billingDaily: retry due but autopay is off, not charged', { tenantId, invoiceKey: inv.key });
    return none;
  }
  const amount = openAmount({
    state: String(inv.data['state'] ?? ''), totalAmount: inv.data['totalAmount'] as InvoiceLike['totalAmount'],
    payments: inv.data['payments'] as InvoiceLike['payments'], reminders: inv.data['reminders'] as InvoiceLike['reminders'],
    accountingTenantId: String(inv.data['accountingTenantId'] ?? ''),
  });
  if (amount <= 0) return none;

  const { outcome, intent } = await readBackEarlierCharge(db, port(), {
    attemptKey: attemptRef.id, paymentIntentId: String(attempt['stripePaymentIntentId'] ?? ''), invoiceKey: inv.key,
  }, log);
  if (outcome === 'settled') {
    log('warn', 'billingDaily: earlier charge had succeeded, recorded instead of charging again', { tenantId, invoiceKey: inv.key, paymentIntentId: intent?.id });
    return { outcome: 'settled', failed: false, inFlight: false };
  }
  if (outcome === 'in-flight') {
    log('info', 'billingDaily: earlier charge still in flight, retried later', { tenantId, invoiceKey: inv.key, status: intent?.status });
    return { outcome: 'waiting', failed: false, inFlight: true };
  }
  if (readBackOnly || !method?.stripePaymentMethodId) {
    // all retries used: nothing left to read back; the reminder run handles the invoice like any open one
    await attemptRef.update({ nextRetryAt: '', updatedAt: toStoreDateTime(new Date()) });
    log('info', 'billingDaily: retries used up, no further charge', { tenantId, invoiceKey: inv.key, status: intent?.status });
    return none;
  }

  const n = retriesDone + 1;
  // Cleared before the charge: should the call throw after Stripe created the PaymentIntent, the next read-back
  // searches by invoice key (finds a succeeded one first) instead of trusting the old declined id.
  await attemptRef.update({ stripePaymentIntentId: '', stripeChargeId: '', amount, updatedAt: toStoreDateTime(new Date()) });
  const accountingTenantId = String(inv.data['accountingTenantId'] ?? '');
  const pi = await port().chargeOffSession({
    customerId, paymentMethodId: method.stripePaymentMethodId, amount,
    description: `Kring-Rechnung ${String(inv.data['invoiceNo'] ?? inv.key)}`,
    metadata: { attemptKey: attemptRef.id, tenantId, accountingTenantId, purpose: 'invoice', invoiceKey: inv.key },
    idempotencyKey: `${inv.key}-r${n}`,
  });
  const issueDate = String(inv.data['invoiceDate'] ?? '');
  const stripeIds = { stripePaymentIntentId: pi.id, stripeChargeId: pi.chargeId };
  if (CHARGE_ON_ITS_WAY.includes(pi.status)) {
    // open until the webhook records it; the next retry day first reads back (a lost webhook is settled then)
    const nextRetryAt = retryDayAfter(issueDate, n, today, true);
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(attemptRef)).data() ?? {};
      const settled = SETTLED_ATTEMPT_STATES.includes(String(current['state'])); // a fast webhook was first
      tx.update(attemptRef, {
        ...stripeIds, retryCount: n, nextRetryAt, updatedAt: toStoreDateTime(new Date()), ...(settled ? {} : { state: 'open', error: '' }),
      });
    });
    log('info', 'billingDaily: retry charged', { tenantId, invoiceKey: inv.key, retry: n, status: pi.status, nextRetryAt });
    return { outcome: 'charged', failed: false, inFlight: true };
  }
  const nextRetryAt = retryDayAfter(issueDate, n, today, false);
  // the mail first: its id is deterministic, so a crash before the attempt update loses nothing
  await notifyChargeFailed(db, tenantId, { invoiceKey: inv.key, amount, attempt: n + 1 });
  await attemptRef.update({
    ...stripeIds, state: 'failed', error: `charge ${pi.status}`, retryCount: n, nextRetryAt, updatedAt: toStoreDateTime(new Date()),
  });
  log('warn', 'billingDaily: retry declined', { tenantId, invoiceKey: inv.key, retry: n, status: pi.status, nextRetryAt });
  return { outcome: 'declined', failed: true, inFlight: false };
}

/**
 * The events of a tenant's day, decided from its open invoices as read by applyBillingEvents (inside its
 * transaction): a declined charge or an overdue invoice only counts while that invoice is still open, and an
 * invoice with money on its way today is not overdue.
 */
export function dayEvents(open: readonly OpenInvoice[], today: string, failedKeys: ReadonlySet<string>, inFlightKeys: ReadonlySet<string>): BillingEvent[] {
  const events: BillingEvent[] = [];
  if (open.some((i) => failedKeys.has(i.key))) events.push({ kind: 'chargeFailed', today });
  if (open.some((i) => { const due = String(i.data['dueDate'] ?? ''); return !inFlightKeys.has(i.key) && due !== '' && due < today; })) {
    events.push({ kind: 'dueDatePassedUnpaid', today });
  }
  if (open.length === 0) events.push({ kind: 'allPaid' });
  events.push({ kind: 'day', today });
  return events;
}

/** One tenant's day: retries first, then the events from the invoices as they are after them. */
async function billTenantDay(
  db: Firestore, port: () => BillingDailyPort, tenantId: string, sub: Doc, accountingTenantId: string, today: string, log: Log,
): Promise<void> {
  const mayCharge = !FINAL_STATES.includes(fieldsOf(sub).state);
  const failedKeys = new Set<string>();
  const inFlightKeys = new Set<string>();
  for (const inv of await openSubscriptionInvoices(db, tenantId, accountingTenantId)) {
    const r = await retryInvoice(db, port, tenantId, sub, inv, today, mayCharge, log);
    if (r.failed) failedKeys.add(inv.key);
    if (r.inFlight) inFlightKeys.add(inv.key);
  }
  await applyBillingEvents(db, tenantId, accountingTenantId, (open) => dayEvents(open, today, failedKeys, inFlightKeys), log);
}

/**
 * The daily job over every subscription with billing 'stripe'. `today` = the scheduled day in Zurich (StoreDate).
 * One tenant's failure is logged and the rest still run; the job then throws so runJobs reports it.
 */
export async function runBillingDaily(
  db: Firestore, today: string, port: () => BillingDailyPort = lazyStripePort(), log: Log = defaultLog,
): Promise<void> {
  const { accountingTenantId } = await platformBilling(db);
  const snap = await db.collection(SubscriptionCollection).where('billing', '==', 'stripe').get();
  const failed: string[] = [];
  for (const doc of snap.docs) {
    try {
      await billTenantDay(db, port, doc.id, doc.data() as Doc, accountingTenantId, today, log);
    } catch (err) {
      failed.push(doc.id);
      log('error', 'billingDaily: tenant failed', { tenantId: doc.id, today, error: err instanceof Error ? err.message : String(err) });
    }
  }
  log('info', `billingDaily: ${snap.size - failed.length} of ${snap.size} tenants done`, { today, failed });
  if (failed.length > 0) throw new Error(`billingDaily: ${failed.length} of ${snap.size} tenants failed: ${failed.join(', ')}`);
}

function lazyStripePort(): () => BillingDailyPort {
  let port: BillingDailyPort | undefined;
  return () => (port ??= stripePort());
}

/** The MORNING_JOBS entry: every day, with the scheduled instant from runJobs. */
export function runBillingDailyJob(now: Date = new Date()): Promise<void> {
  return runBillingDaily(getFirestore(), toStoreDate(now));
}

/**
 * A subscription invoice turned paid (Stripe webhook, QR bill or bank import alike): once none of the tenant's
 * subscription invoices is open any more, pastDue / closing return to active. An invoice outside the operator
 * books is ignored.
 */
export async function subscriptionInvoicePaid(
  db: Firestore, invoiceKey: string, invoice: Doc, today: string, log: Log,
): Promise<void> {
  const tenantId = String((invoice['receiver'] as { key?: string } | undefined)?.key ?? '');
  const { accountingTenantId } = await platformBilling(db);
  if (String(invoice['accountingTenantId'] ?? '') !== accountingTenantId || !tenantId) {
    log('warn', 'billingPaid: subscription invoice outside the operator books or without receiver, ignored', { invoiceKey, tenantId });
    return;
  }
  if (!(await db.collection(SubscriptionCollection).doc(tenantId).get()).exists) {
    log('warn', 'billingPaid: receiver has no subscription, ignored', { invoiceKey, tenantId });
    return;
  }
  // decided inside the state transaction: only allPaid (and the day) — never a new pastDue from this trigger
  await applyBillingEvents(db, tenantId, accountingTenantId,
    (open) => (open.length === 0 ? [{ kind: 'allPaid' }, { kind: 'day', today }] : []), log);
}
