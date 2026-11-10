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
// 3. State: written in a transaction on the subscription; entering pastDue / closing mails the tenant.
//
// `cancelled` and `closed` never change by events, and their invoices are not charged again.
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { InvoiceCollection, PaymentAttemptCollection, SubscriptionCollection } from '@okr/shared-models';
import type { SavedPaymentMethod, SubscriptionState } from '@okr/shared-models';

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

/**
 * The tenant's open monthly invoices in the operator books (issued and payable: pending / partial / unpaid; not
 * draft, paid, cancelled or archived), sorted by key.
 */
export async function openSubscriptionInvoices(db: Firestore, tenantId: string, accountingTenantId: string): Promise<OpenInvoice[]> {
  const snap = await db.collection(InvoiceCollection)
    .where('receiver.key', '==', tenantId).where('billingKind', '==', 'subscription').where('accountingTenantId', '==', accountingTenantId)
    .get();
  return snap.docs
    .map((d) => ({ key: d.id, data: d.data() as Doc }))
    .filter((i) => i.data['isArchived'] !== true && isPayableState(String(i.data['state'] ?? '')))
    .sort((a, b) => a.key.localeCompare(b.key));
}

const fieldsOf = (sub: Doc): BillingStateFields => ({
  state: (sub['state'] as SubscriptionState | undefined) ?? 'active',
  pastDueSince: String(sub['pastDueSince'] ?? ''),
  closingSince: String(sub['closingSince'] ?? ''),
});

/**
 * Applies `events` to the subscription in a transaction and mails on entering pastDue or closing (the mail ids are
 * deterministic per date, so a repeated call queues each once). Returns the state before and after.
 */
export async function applyBillingEvents(
  db: Firestore, tenantId: string, events: readonly BillingEvent[], invoiceKeys: string[], log: Log,
): Promise<{ before: BillingStateFields; after: BillingStateFields }> {
  const ref = db.collection(SubscriptionCollection).doc(tenantId);
  const { before, after } = await db.runTransaction(async (tx) => {
    const before = fieldsOf((await tx.get(ref)).data() ?? {});
    const after = applyEvents(before, events);
    if (after.state !== before.state || after.pastDueSince !== before.pastDueSince || after.closingSince !== before.closingSince) {
      tx.update(ref, { state: after.state, pastDueSince: after.pastDueSince, closingSince: after.closingSince });
    }
    return { before, after };
  });
  if (after.state === before.state) return { before, after };
  log('info', `billing: ${tenantId} ${before.state} → ${after.state}`, { tenantId, events: events.map((e) => e.kind), invoiceKeys });
  if (after.state === 'pastDue') await notifyPastDue(db, tenantId, { invoiceKeys, pastDueSince: after.pastDueSince });
  if (after.state === 'closing') await notifyClosing(db, tenantId, { closingSince: after.closingSince, invoiceKeys });
  return { before, after };
}

type RetryOutcome = 'none' | 'waiting' | 'settled' | 'charged' | 'declined';

/**
 * The due retry of one open invoice, if any. `failed` = the invoice's automatic charge stands declined afterwards
 * (the chargeFailed event).
 */
async function retryInvoice(
  db: Firestore, port: () => BillingDailyPort, tenantId: string, sub: Doc, inv: OpenInvoice, today: string, mayCharge: boolean, log: Log,
): Promise<{ outcome: RetryOutcome; failed: boolean }> {
  const attemptRef = db.collection(PaymentAttemptCollection).doc(`auto-${inv.key}`);
  const attempt = (await attemptRef.get()).data();
  if (!attempt) return { outcome: 'none', failed: false };
  const failed = attempt['state'] === 'failed';
  const retriesDone = Number(attempt['retryCount'] ?? 0);
  const due = String(attempt['nextRetryAt'] ?? '');
  if (!mayCharge || !RETRYABLE_ATTEMPT_STATES.includes(String(attempt['state'])) || !due || due > today || retriesDone >= RETRY_DAYS.length) {
    return { outcome: 'none', failed };
  }
  const method = sub['paymentMethod'] as SavedPaymentMethod | null | undefined;
  const customerId = String(sub['stripeCustomerId'] ?? '');
  if (sub['autopay'] !== true || !method?.stripePaymentMethodId || !customerId) {
    log('info', 'billingDaily: retry due but autopay is off, not charged', { tenantId, invoiceKey: inv.key });
    return { outcome: 'none', failed };
  }
  const amount = openAmount({
    state: String(inv.data['state'] ?? ''), totalAmount: inv.data['totalAmount'] as InvoiceLike['totalAmount'],
    payments: inv.data['payments'] as InvoiceLike['payments'], reminders: inv.data['reminders'] as InvoiceLike['reminders'],
    accountingTenantId: String(inv.data['accountingTenantId'] ?? ''),
  });
  if (amount <= 0) return { outcome: 'none', failed };

  const { outcome, intent } = await readBackEarlierCharge(db, port(), {
    attemptKey: attemptRef.id, paymentIntentId: String(attempt['stripePaymentIntentId'] ?? ''), invoiceKey: inv.key,
  }, log);
  if (outcome === 'settled') {
    log('warn', 'billingDaily: earlier charge had succeeded, recorded instead of charging again', { tenantId, invoiceKey: inv.key, paymentIntentId: intent?.id });
    return { outcome: 'settled', failed: false };
  }
  if (outcome === 'in-flight') {
    log('info', 'billingDaily: earlier charge still in flight, retried later', { tenantId, invoiceKey: inv.key, status: intent?.status });
    return { outcome: 'waiting', failed: false };
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
  const nextRetryAt = issueDate ? nextRetryDate(issueDate, n) : '';
  const stripeIds = { stripePaymentIntentId: pi.id, stripeChargeId: pi.chargeId };
  if (CHARGE_ON_ITS_WAY.includes(pi.status)) {
    // open until the webhook records it; the next retry day only reads back (a lost webhook is settled then)
    await db.runTransaction(async (tx) => {
      const current = (await tx.get(attemptRef)).data() ?? {};
      const settled = SETTLED_ATTEMPT_STATES.includes(String(current['state'])); // a fast webhook was first
      tx.update(attemptRef, {
        ...stripeIds, retryCount: n, nextRetryAt, updatedAt: toStoreDateTime(new Date()), ...(settled ? {} : { state: 'open', error: '' }),
      });
    });
    log('info', 'billingDaily: retry charged', { tenantId, invoiceKey: inv.key, retry: n, status: pi.status });
    return { outcome: 'charged', failed: false };
  }
  // the mail first: its id is deterministic, so a crash before the attempt update loses nothing
  await notifyChargeFailed(db, tenantId, { invoiceKey: inv.key, amount, attempt: n + 1 });
  await attemptRef.update({
    ...stripeIds, state: 'failed', error: `charge ${pi.status}`, retryCount: n, nextRetryAt, updatedAt: toStoreDateTime(new Date()),
  });
  log('warn', 'billingDaily: retry declined', { tenantId, invoiceKey: inv.key, retry: n, status: pi.status, nextRetryAt });
  return { outcome: 'declined', failed: true };
}

/** One tenant's day: retries, events, state. */
async function billTenantDay(
  db: Firestore, port: () => BillingDailyPort, tenantId: string, sub: Doc, accountingTenantId: string, today: string, log: Log,
): Promise<void> {
  const mayCharge = !FINAL_STATES.includes(fieldsOf(sub).state);
  let open = await openSubscriptionInvoices(db, tenantId, accountingTenantId);
  let chargeFailed = false;
  let settled = false;
  for (const inv of open) {
    const r = await retryInvoice(db, port, tenantId, sub, inv, today, mayCharge, log);
    chargeFailed ||= r.failed;
    settled ||= r.outcome === 'settled';
  }
  if (settled) open = await openSubscriptionInvoices(db, tenantId, accountingTenantId);

  const events: BillingEvent[] = [];
  if (chargeFailed) events.push({ kind: 'chargeFailed', today });
  if (open.some((i) => { const due = String(i.data['dueDate'] ?? ''); return due !== '' && due < today; })) {
    events.push({ kind: 'dueDatePassedUnpaid', today });
  }
  if (open.length === 0) events.push({ kind: 'allPaid' });
  events.push({ kind: 'day', today });
  await applyBillingEvents(db, tenantId, events, open.map((i) => i.key), log);
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
  const open = await openSubscriptionInvoices(db, tenantId, accountingTenantId);
  if (open.length > 0) {
    log('info', 'billingPaid: other subscription invoices still open', { invoiceKey, tenantId, open: open.map((i) => i.key) });
    return;
  }
  await applyBillingEvents(db, tenantId, [{ kind: 'allPaid' }, { kind: 'day', today }], [], log);
}
