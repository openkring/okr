// apps/functions/src/billing/billing-run.ts
//
// The monthly billing run (design §7.5, plan 2 Task 4). The morning job on the 1st (Zurich) only writes one request
// doc per billable tenant (subscriptions/{tenantId}/billing-runs/{yyyyMM}); the creation of that doc starts
// onBillingRunRequested, which measures the tenant, issues the monthly invoice in the operator books (a PDF render:
// issueInvoice's runtime options) and charges the saved payment method off-session, or mails the invoice to a manual
// payer. Every step is idempotent (invoice okey `billing-<tenantId>-<period>`, Stripe idempotency key = invoice key,
// attempt `auto-<invoiceKey>`, the invoice's sentAt), so the trigger runs with retry: true.
//
// Phases on the run doc: before issuing, the run stores what it computed (band, history, measurement, positions,
// invoiceKey; phase 'issuing'); a retry reuses exactly that — no re-measurement, no isBillable re-check — so a crash
// between the issue and the subscription update can neither skip the tenant nor change the invoice (okey-mismatch).
// Then 'issued' (subscription updated) and 'collected' (charged or mailed).
//
// A run doc blocks re-requesting its period (the job only creates missing docs): after fixing the cause of a refused
// or failed run, delete subscriptions/{t}/billing-runs/{period} and its creation by the next job (or by hand) re-runs it.
// Credit: reversals net into the month they are dated in, not the month of their deduction; a product whose month
// nets to nothing or below is dropped from the invoice.
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import {
  BillingRunSubcollection, CreditAccountCollection, CreditEntrySubcollection, InvoiceCollection, PaymentAttemptCollection,
  PaymentAttemptModel, SubscriptionCollection,
} from '@okr/shared-models';
import type { BandId, BillingFlag, SavedPaymentMethod, SubscriptionMeasurement } from '@okr/shared-models';
import { addDuration } from '@okr/shared-util-core';

import { platformBilling } from '../collection/platform';
import { appOriginOf } from '../collection/payment-method';
import { stripePort, stripeSecretKey } from '../collection/stripe-port';
import type { StripePort } from '../collection/stripe-port';
import { tenantOrgAvatar } from '../credit/topup.core';
import { createAndIssueInvoice } from '../invoice/invoice-issue.core';
import { loadOwnedAccountingConfig } from '../invoice/invoice-context';
import { openAmount } from '../invoice/invoice-payment.logic';
import type { InvoiceLike } from '../invoice/invoice-payment.logic';
import { INVOICE_MAIL_SECRETS, sendInvoiceMail } from '../invoice/send-invoice-email.core';
import { toStoreDate, toStoreDateTime } from '../srv/zurich-time';
import { billingRecipient, notifyChargeFailed, payLink } from './billing-mail';
import { measureTenant } from './measure';
import { lastDayOfPreviousMonth } from './measure.logic';
import {
  billingPeriod, chooseBand, creditOfMonth, isBillable, isIndividuallyPriced, monthlyPositions, previousPeriod,
} from './monthly-invoice.logic';
import type { CreditEntryLike, MonthlyPosition, SubscriptionLike } from './monthly-invoice.logic';

const DUE_DAYS = 10;
/** A declined monthly charge is tried again this many days after the invoice date (Task 5 runs the retries). */
const RETRY_AFTER_DAYS = 3;
/** Statuses of an off-session PaymentIntent after which the money is (or will be) on its way; the webhook records it. */
const CHARGE_ON_ITS_WAY = ['succeeded', 'processing'];
/** The flags a run sets when it refuses a tenant; a run that issues clears them. */
const RUN_FLAGS: readonly BillingFlag[] = ['vat-blocked', 'individual-band', 'accounts-missing', 'run-failed', 'no-recipient'];
/** HttpsError codes of a refusal that a retry cannot fix: logged and flagged, never retried. */
const PERMANENT_CODES = ['failed-precondition', 'invalid-argument', 'permission-denied', 'not-found'];

/** The nudge line of the invoice mail to a manual payer. */
export const AUTOPAY_NUDGE = 'Mit einer gespeicherten Karte oder PayPal zahlst du künftig automatisch.';

export type Log = (level: 'info' | 'warn' | 'error', message: string, data: Record<string, unknown>) => void;
export type BillingRunPort = Pick<StripePort, 'chargeOffSession'>;
export type BillingRunOutcome = 'skipped' | 'refused' | 'issued' | 'charged' | 'declined' | 'mailed';

type Doc = Record<string, unknown>;

export const billingInvoiceKey = (tenantId: string, period: string): string => `billing-${tenantId}-${period}`;

/** The `when` of the morning job: the 1st of the month in Zurich. */
export function isFirstOfMonthInZurich(now: Date): boolean {
  return toStoreDate(now).slice(6, 8) === '01';
}

const runRef = (db: Firestore, tenantId: string, period: string): DocumentReference =>
  db.collection(SubscriptionCollection).doc(tenantId).collection(BillingRunSubcollection).doc(period);

/**
 * The morning job: one request doc `subscriptions/{t}/billing-runs/{period}` per billable subscription (billing
 * 'stripe', active or pastDue, past its billingStart, not yet run for the period). An existing request is left as is,
 * so a second job run on the same day requests nothing. Returns the number of new requests.
 */
export async function requestMonthlyRuns(db: Firestore, runDate: string): Promise<number> {
  const period = billingPeriod(runDate);
  const snap = await db.collection(SubscriptionCollection).where('billing', '==', 'stripe').get();
  let requested = 0;
  for (const doc of snap.docs) {
    if (!isBillable(doc.data() as SubscriptionLike, period)) continue;
    try {
      await runRef(db, doc.id, period).create({
        tenants: [doc.id], period, runDate, requestedAt: toStoreDateTime(new Date()), state: 'requested',
      });
      requested++;
    } catch (err) {
      if ((err as { code?: number })?.code !== 6) throw err; // 6 = ALREADY_EXISTS: requested before
    }
  }
  logger.info(`monthlyBilling: ${requested} billing runs requested for ${period}`, { candidates: snap.size });
  return requested;
}

/** Adds `value` to the subscription's billingFlags (once, atomically: never re-adds a flag cleared meanwhile). */
async function flag(db: Firestore, tenantId: string, value: BillingFlag): Promise<void> {
  await db.collection(SubscriptionCollection).doc(tenantId).update({ billingFlags: FieldValue.arrayUnion(value) });
}

/** What a run computed before issuing, stored on the run doc and reused by every retry. */
interface RunPlan {
  phase: 'issuing' | 'issued' | 'collected';
  invoiceKey: string;
  operatorTenantId: string;
  accountingTenantId: string;
  band: BandId;
  history: BandId[];
  measurement: SubscriptionMeasurement;
  positions: MonthlyPosition[];
}

/**
 * Runs the billing of one tenant for `period` (yyyyMM). A subscription already run for the period (lastRunPeriod)
 * resumes at the collection step: a retried event charges or mails what the first try left undone, never twice.
 */
export async function runMonthlyBilling(
  db: Firestore, port: () => BillingRunPort, tenantId: string, period: string, log: Log, now: Date = new Date(),
): Promise<BillingRunOutcome> {
  const sub = (await db.collection(SubscriptionCollection).doc(tenantId).get()).data();
  if (!sub) {
    log('warn', 'monthlyBilling: no subscription, run skipped', { tenantId, period });
    return 'skipped';
  }
  const invoiceKey = billingInvoiceKey(tenantId, period);
  const ref = runRef(db, tenantId, period);
  if (sub['lastRunPeriod'] !== period) {
    const stored = (await ref.get()).data();
    let plan = Array.isArray(stored?.['positions']) ? (stored as unknown as RunPlan) : undefined;
    if (plan) {
      log('info', 'monthlyBilling: resuming a run from its stored plan', { tenantId, period, phase: plan.phase });
    } else {
      if (!isBillable(sub as SubscriptionLike, period)) {
        log('info', 'monthlyBilling: not billable (any more), run skipped', { tenantId, period, state: sub['state'] });
        return 'skipped';
      }
      const planned = await planMonthlyInvoice(db, tenantId, period, sub, invoiceKey, log);
      if (planned === 'refused') return 'refused';
      plan = planned;
      await ref.set({ ...plan }, { merge: true }); // before issuing: every retry issues exactly this invoice
    }
    await issueAndRecord(db, tenantId, period, plan, log);
    await ref.set({ phase: 'issued' }, { merge: true });
  }
  const outcome = await collect(db, port, tenantId, invoiceKey, log, now);
  await ref.set({ phase: 'collected' }, { merge: true });
  return outcome;
}

/** Checks the books, measures, chooses the band and builds the positions; refuses (with a board flag) or returns the plan. */
async function planMonthlyInvoice(
  db: Firestore, tenantId: string, period: string, sub: Doc, invoiceKey: string, log: Log,
): Promise<RunPlan | 'refused'> {
  const { operatorTenantId, accountingTenantId } = await platformBilling(db);
  const config = await loadOwnedAccountingConfig(db, operatorTenantId, invoiceKey, accountingTenantId);
  if (config['vatMethod'] !== 'exempt') {
    // VAT (§7.9) is not built: the run never issues an invoice without the tax it would owe
    log('error', 'monthlyBilling: the operator books are not VAT-exempt, no invoice', { tenantId, period, accountingTenantId, vatMethod: config['vatMethod'] });
    await flag(db, tenantId, 'vat-blocked');
    return 'refused';
  }
  const accounts = {
    subscription: String(config['subscriptionRevenueAccountKey'] ?? ''),
    transaction: String(config['transactionRevenueAccountKey'] ?? ''),
  };
  if (!accounts.subscription || !accounts.transaction) {
    log('error', 'monthlyBilling: the operator books lack a revenue account, no invoice', { tenantId, period, accountingTenantId, ...accounts });
    await flag(db, tenantId, 'accounts-missing');
    return 'refused';
  }

  const lastDay = lastDayOfPreviousMonth(`${period}01`);
  const measured = await measureTenant(db, tenantId, lastDay);
  if (isIndividuallyPriced(measured.weighted)) {
    log('warn', 'monthlyBilling: tenant is priced individually, no invoice', { tenantId, period, ...measured });
    await flag(db, tenantId, 'individual-band');
    return 'refused';
  }
  const { band, history } = chooseBand(measured.weighted, (sub['bandHistory'] as BandId[] | undefined) ?? []);

  const prev = previousPeriod(period);
  const entries = await db.collection(CreditAccountCollection).doc(tenantId).collection(CreditEntrySubcollection)
    .where('date', '>=', `${prev}01000000`).where('date', '<', `${period}01000000`).get();
  const credit = creditOfMonth(entries.docs.map((d) => d.data() as CreditEntryLike));

  const { positions, skipped } = monthlyPositions({ period, band, options: (sub['options'] as string[] | undefined) ?? [], credit, accounts });
  if (skipped.length > 0) log('warn', 'monthlyBilling: options without a price are not billed', { tenantId, period, skipped });

  const measurement: SubscriptionMeasurement = {
    period: lastDay.slice(0, 6), totalUsers: measured.totalUsers, privilegedUsers: measured.privilegedUsers,
    excludedUsers: measured.excludedUsers, weighted: measured.weighted,
  };
  return { phase: 'issuing', invoiceKey, operatorTenantId, accountingTenantId, band, history, measurement, positions };
}

/** Issues the planned invoice (idempotent on its okey) and records the run on the subscription in one write. */
async function issueAndRecord(db: Firestore, tenantId: string, period: string, plan: RunPlan, log: Log): Promise<void> {
  const receiver = await tenantOrgAvatar(db, tenantId);
  await createAndIssueInvoice(db, {
    okey: plan.invoiceKey, tenantId: plan.operatorTenantId, accountingTenantId: plan.accountingTenantId, receiver,
    title: `Kring-Abo ${receiver.name2} ${period.slice(4, 6)}.${period.slice(0, 4)}`, billingKind: 'subscription',
    positions: plan.positions, dueDays: DUE_DAYS, actor: 'system',
  });
  await db.collection(SubscriptionCollection).doc(tenantId).update({
    currentBand: plan.band, bandHistory: plan.history, lastMeasurement: plan.measurement, lastRunPeriod: period,
    billingFlags: FieldValue.arrayRemove(...RUN_FLAGS),
  });
  log('info', 'monthlyBilling: invoice issued', { tenantId, period, invoiceKey: plan.invoiceKey, band: plan.band, weighted: plan.measurement.weighted });
}

/** Charges the issued invoice off-session (autopay) or mails it (manual payer). Idempotent. */
async function collect(
  db: Firestore, port: () => BillingRunPort, tenantId: string, invoiceKey: string, log: Log, now: Date,
): Promise<BillingRunOutcome> {
  const sub = (await db.collection(SubscriptionCollection).doc(tenantId).get()).data() ?? {};
  const invoice = (await db.collection(InvoiceCollection).doc(invoiceKey).get()).data();
  if (!invoice) throw new Error(`monthlyBilling: invoice ${invoiceKey} not found after issuing`);
  const state = String(invoice['state'] ?? '');
  const amount = openAmount({
    state, totalAmount: invoice['totalAmount'] as InvoiceLike['totalAmount'], payments: invoice['payments'] as InvoiceLike['payments'],
    accountingTenantId: String(invoice['accountingTenantId'] ?? ''),
  });
  if (state === 'paid' || state === 'cancelled' || amount <= 0) {
    log('info', 'monthlyBilling: nothing left to collect', { tenantId, invoiceKey, state });
    return 'issued';
  }

  const method = sub['paymentMethod'] as SavedPaymentMethod | null | undefined;
  const customerId = String(sub['stripeCustomerId'] ?? '');
  if (sub['autopay'] === true && method?.stripePaymentMethodId && customerId) {
    return charge(db, port, tenantId, invoiceKey, invoice, amount, { customerId, paymentMethodId: method.stripePaymentMethodId }, log, now);
  }
  return mail(db, tenantId, invoiceKey, invoice, log);
}

async function charge(
  db: Firestore, port: () => BillingRunPort, tenantId: string, invoiceKey: string, invoice: Doc, amount: number,
  payer: { customerId: string; paymentMethodId: string }, log: Log, now: Date,
): Promise<BillingRunOutcome> {
  const accountingTenantId = String(invoice['accountingTenantId'] ?? '');
  const operatorTenantId = ((invoice['tenants'] as string[] | undefined) ?? [])[0] ?? '';
  const attemptRef = db.collection(PaymentAttemptCollection).doc(`auto-${invoiceKey}`);
  const existing = (await attemptRef.get()).data();
  if (existing?.['stripePaymentIntentId']) {
    log('info', 'monthlyBilling: already charged', { tenantId, invoiceKey, state: existing['state'] });
    return existing['state'] === 'failed' ? 'declined' : 'charged';
  }
  const stamp = toStoreDateTime(now);
  if (!existing) {
    // the attempt before the charge: a fast webhook finds it (R1 metadata names it)
    const { okey: _okey, ...attempt } = new PaymentAttemptModel(operatorTenantId);
    await attemptRef.set({
      ...attempt, payerTenantId: tenantId, accountingTenantId, purpose: 'invoice', invoiceKey, amount, offSession: true,
      createdBy: 'system', state: 'open', createdAt: stamp, updatedAt: stamp,
    });
  }
  // From here on the charge may reach Stripe: a thrown call is retried with the same idempotency key.
  const pi = await port().chargeOffSession({
    customerId: payer.customerId, paymentMethodId: payer.paymentMethodId, amount,
    description: `Kring-Rechnung ${String(invoice['invoiceNo'] ?? invoiceKey)}`,
    metadata: { attemptKey: attemptRef.id, tenantId, accountingTenantId, purpose: 'invoice', invoiceKey },
    idempotencyKey: invoiceKey,
  });
  if (CHARGE_ON_ITS_WAY.includes(pi.status)) {
    await attemptRef.update({ stripePaymentIntentId: pi.id, stripeChargeId: pi.chargeId, updatedAt: toStoreDateTime(new Date()) });
    log('info', 'monthlyBilling: charged', { tenantId, invoiceKey, amount, status: pi.status });
    return 'charged';
  }
  // the mail first: its id is deterministic (a re-send is a no-op), so a crash before the attempt update loses nothing
  await notifyChargeFailed(db, tenantId, { invoiceKey, amount, attempt: 1 });
  const issueDate = String(invoice['invoiceDate'] || toStoreDate(now));
  await attemptRef.update({
    stripePaymentIntentId: pi.id, stripeChargeId: pi.chargeId, state: 'failed', error: `charge ${pi.status}`,
    retryCount: 0, nextRetryAt: addDuration(issueDate, { days: RETRY_AFTER_DAYS }), updatedAt: toStoreDateTime(new Date()),
  });
  log('warn', 'monthlyBilling: charge declined, retried later', { tenantId, invoiceKey, status: pi.status });
  return 'declined';
}

/** The invoice mail (PDF with the QR slip) to the billing recipient, with the pay link and the autopay nudge. Once. */
async function mail(db: Firestore, tenantId: string, invoiceKey: string, invoice: Doc, log: Log): Promise<BillingRunOutcome> {
  if (invoice['sentAt']) {
    log('info', 'monthlyBilling: invoice already mailed', { tenantId, invoiceKey });
    return 'mailed';
  }
  const to = await billingRecipient(db, tenantId);
  if (!to) {
    log('error', 'monthlyBilling: tenant has no billing or admin e-mail, invoice not mailed', { tenantId, invoiceKey });
    await flag(db, tenantId, 'no-recipient');
    return 'issued';
  }
  const link = payLink(await appOriginOf(db, tenantId), invoiceKey);
  const href = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const extraHtml = `<p>Du kannst die Rechnung auch online bezahlen: <a href="${href}">${href}</a></p><p>${AUTOPAY_NUDGE}</p>`;
  const operatorTenantId = ((invoice['tenants'] as string[] | undefined) ?? [])[0] ?? '';
  await sendInvoiceMail(db, operatorTenantId, { invoiceKey, documentKey: String(invoice['documentKey'] ?? '') }, { uid: 'system', to: [to], extraHtml });
  log('info', 'monthlyBilling: invoice mailed', { tenantId, invoiceKey });
  return 'mailed';
}

/**
 * One billing-run request: runs it and records the outcome on the run doc. A permanent refusal (an HttpsError a retry
 * cannot fix, e.g. foreign books or an okey mismatch) is logged, flagged `run-failed` and not retried; anything else
 * is rethrown so the event is retried.
 */
export async function handleBillingRunRequest(
  db: Firestore, port: () => BillingRunPort, tenantId: string, period: string, log: Log,
): Promise<void> {
  const ref = runRef(db, tenantId, period);
  try {
    const outcome = await runMonthlyBilling(db, port, tenantId, period, log);
    await ref.set({ state: outcome, invoiceKey: billingInvoiceKey(tenantId, period), finishedAt: toStoreDateTime(new Date()) }, { merge: true });
  } catch (err) {
    if (!(err instanceof HttpsError) || !PERMANENT_CODES.includes(err.code)) {
      log('error', 'monthlyBilling: run failed, retried', { tenantId, period, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }
    const reason = String((err.details as { reason?: string } | undefined)?.reason ?? err.code);
    log('error', 'monthlyBilling: run refused', { tenantId, period, reason, error: err.message });
    await flag(db, tenantId, 'run-failed');
    await ref.set({ state: 'failed', reason, finishedAt: toStoreDateTime(new Date()) }, { merge: true });
  }
}

/** The morning job entry (MORNING_JOBS, only on the 1st). */
export function runMonthlyBillingRequests(now: Date = new Date()): Promise<number> {
  return requestMonthlyRuns(getFirestore(), toStoreDate(now));
}

export const onBillingRunRequested = onDocumentCreated(
  {
    document: `${SubscriptionCollection}/{tenantId}/${BillingRunSubcollection}/{period}`,
    region: 'europe-west6', secrets: [stripeSecretKey, ...INVOICE_MAIL_SECRETS],
    memory: '1GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 10, retry: true,
  },
  async (event) => {
    const tenantId = event.params['tenantId'] as string;
    const period = event.params['period'] as string;
    let port: BillingRunPort | undefined;
    await handleBillingRunRequest(getFirestore(), () => (port ??= stripePort()), tenantId, period,
      (level, message, data) => logger[level](message, data));
  },
);
