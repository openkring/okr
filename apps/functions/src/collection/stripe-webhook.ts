// apps/functions/src/collection/stripe-webhook.ts
//
// Stripe on the shared webhook receiver (_webhooks), plan 1.149 Task 7. Stripe is only a payment
// processor behind our own invoice: a succeeded PaymentIntent is recorded as a payment on that invoice
// (postInvoicePayment, Stripe clearing account as the bank) and its fee is booked separately. A finished
// setup session stores the tenant's payment method. Every effect is idempotent: Stripe retries, and the
// replay script may run a row again.
//
// The credit for a paid top-up is NOT written here: Task 9's invoice trigger (credit/topup-paid.trigger.ts)
// handles Stripe and QR alike. A failed off-session top-up switches auto top-up off here.
import { logger } from 'firebase-functions/v2';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { PaymentAttemptCollection, SubscriptionCollection } from '@okr/shared-models';
import type { PaymentAttemptModel } from '@okr/shared-models';

import type { WebhookHandler, WebhookOutcome } from '../_webhooks/process';
import type { WebhookClient } from '../_webhooks/types';
import { periodKeyFor } from '../bank-import/bank-import.util';
import { allocateBookingNo } from '../booking/booking-no';
import { assertPeriodsOpen, touchedPeriodKeys } from '../booking/period-lock';
import { costCenterKeyForLine, loadCostCenterContext } from '../cost-center/cost-center-context';
import { assertLeafAccount, loadOwnedAccountingConfig } from '../invoice/invoice-context';
import { BOOKING_COLLECTION, BOOKING_LINE_COLLECTION, postInvoicePayment } from '../invoice/invoice-payment.core';
import { invoiceBookingIndex, withoutUndefined } from '../invoice/invoice.logic';
import { toStoreDateTime } from '../srv/zurich-time';
import { clearAutoTopUp, switchOffAutoTopUp } from '../credit/auto-topup-request';
import { notifyAutoTopUpFailed } from '../credit/topup-failed-mail';
import { ensureSubscription } from './payment-method';
import { platformBilling } from './platform';
import { stripePort, stripeWebhookSecret } from './stripe-port';
import type { StripePort } from './stripe-port';
import { feeBookingLines, isSettledRefusal, reduceStripeEvent, stripeActionOf, stripePaymentId } from './stripe-webhook.logic';
import type { StripeAction } from './stripe-webhook.logic';

export type { StripeAction } from './stripe-webhook.logic';
export { stripeActionOf } from './stripe-webhook.logic';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const stripeClient: WebhookClient = {
  id: 'stripe',
  type: 'stripe',
  auth: { kind: 'stripe-signature', secret: stripeWebhookSecret, toleranceSec: 300 },
  tenant: { scope: 'platform' },
  // Only the fields the handler reads are stored: no customer names, emails or addresses in webhook-events.
  split: raw => [reduceStripeEvent(JSON.parse(raw.toString('utf8')))],
  dedupeKey: event => {
    const id = isObject(event) ? event['id'] : undefined;
    if (typeof id !== 'string' || id === '') throw new Error('Stripe event has no id');
    return id;
  },
  maxBodyBytes: 256 * 1024,
  retentionDays: 90,
};

export type StripeHandlerPort = Pick<StripePort, 'feeOfCharge' | 'paymentMethodDisplay' | 'setupIntentPaymentMethod' | 'detachPaymentMethod'>;

export interface StripeHandlerDeps {
  db(): Firestore;
  /** Called lazily inside the handler: the secret is only readable at run time. */
  port(): StripeHandlerPort;
  now(): Date;
  log(level: 'info' | 'warn' | 'error', message: string, data: Record<string, unknown>): void;
  /** Tells the payer's admin that an auto top-up failed (idempotent per attempt); absent in tests that do not care. */
  notifyTopUpFailed?(payerTenantId: string, topUp: { attemptKey: string; invoiceKey: string; amount: number }): Promise<void>;
}

type Attempt = Omit<PaymentAttemptModel, 'okey'>;

const ACTOR = 'stripe';
/** Attempt states a late failure / expiry must not overwrite. */
const SETTLED_STATES = ['succeeded', 'overpaid'];

export function makeStripeHandler(deps: StripeHandlerDeps): WebhookHandler {
  return async event => {
    const action = stripeActionOf(event.payload);
    const db = deps.db();
    switch (action.kind) {
      case 'payment-succeeded':
        return paymentSucceeded(db, deps, action);
      case 'payment-failed':
        return paymentFailed(db, deps, action);
      case 'method-saved':
        return methodSaved(db, deps, action);
      case 'ignore':
        if (action.expireAttemptKey) await expireAttempt(db, deps, action.expireAttemptKey);
        deps.log('info', 'stripeHandler: ignored', { reason: action.reason });
        return { state: 'ignored' };
    }
  };
}

async function loadAttempt(db: Firestore, attemptKey: string): Promise<Attempt> {
  const attempt = (await db.collection(PaymentAttemptCollection).doc(attemptKey).get()).data() as Attempt | undefined;
  // Fail (reported, replayable): the money or the decline belongs to an attempt we do not know.
  if (!attempt) throw new Error(`Stripe event for unknown payment attempt ${attemptKey}`);
  return attempt;
}

const operatorOf = (attempt: Attempt): string | undefined => attempt.tenants?.[0];

/**
 * Records a succeeded PaymentIntent on its attempt's invoice: payment (Stripe clearing), fee, attempt succeeded.
 * Idempotent. Also used by the auto top-up when it finds a charge whose webhook never arrived.
 */
export async function settleSucceededPayment(
  db: Firestore, deps: StripeHandlerDeps, action: Extract<StripeAction, { kind: 'payment-succeeded' }>,
): Promise<WebhookOutcome> {
  return paymentSucceeded(db, deps, action);
}

async function paymentSucceeded(
  db: Firestore, deps: StripeHandlerDeps, action: Extract<StripeAction, { kind: 'payment-succeeded' }>,
): Promise<WebhookOutcome> {
  const { attemptKey, paymentIntentId, chargeId, amount, date } = action;
  const attemptRef = db.collection(PaymentAttemptCollection).doc(attemptKey);
  // 1. idempotency: a settled attempt has nothing left to do
  const attempt = await loadAttempt(db, attemptKey);
  if (SETTLED_STATES.includes(attempt.state)) return { state: 'ignored', tenantId: operatorOf(attempt) };
  if (!paymentIntentId || !chargeId) throw new Error(`Stripe payment for attempt ${attemptKey} has no PaymentIntent or charge`);

  const stripeIds = { stripePaymentIntentId: paymentIntentId, stripeChargeId: chargeId };
  const fail = async (error: string, data: Record<string, unknown>): Promise<WebhookOutcome> => {
    await attemptRef.update({ state: 'failed', ...stripeIds, error, updatedAt: toStoreDateTime(deps.now()) });
    deps.log('error', `stripeHandler: payment not recorded (${error})`, { attemptKey, paymentIntentId, ...data });
    return { state: 'handled', tenantId: operatorOf(attempt) };
  };

  // Guards before anything is posted: our books are in CHF and belong to the operator.
  if (action.currency !== 'chf') return fail(`currency-mismatch: ${action.currency || '(none)'}`, { amount });
  const { operatorTenantId, accountingTenantId } = await platformBilling(db);
  const invoiceKey = attempt.invoiceKey;
  const invoiceBooks = String((await db.collection('invoices').doc(invoiceKey).get()).data()?.['accountingTenantId'] ?? '');
  if (invoiceBooks !== accountingTenantId) return fail(`books-mismatch: invoice ${invoiceBooks || '(none)'}, operator ${accountingTenantId}`, { invoiceKey });
  // The money arrived: a different amount is still posted as received, and the difference is noted on the attempt.
  const mismatch = amount !== attempt.amount ? `amount-mismatch: expected ${attempt.amount} received ${amount}` : '';
  if (mismatch) deps.log('warn', `stripeHandler: ${mismatch}`, { attemptKey, invoiceKey, paymentIntentId });

  const config = await loadOwnedAccountingConfig(db, operatorTenantId, invoiceKey, accountingTenantId, 'paid');
  const clearingKey = String(config['stripeClearingAccountKey'] ?? '');
  if (!clearingKey) throw new Error(`${accountingTenantId} has no stripeClearingAccountKey: Stripe collection is not set up`);

  // 2. the payment on our invoice, Stripe clearing as the bank (idempotent on paymentId)
  let paymentBookingKey: string;
  try {
    const result = await postInvoicePayment(db, {
      tenantId: operatorTenantId, invoiceKey, paymentId: stripePaymentId(paymentIntentId), date, amount, bankAccountKey: clearingKey, actor: ACTOR,
    });
    paymentBookingKey = result.bookingKey;
  } catch (err) {
    const details = (err as { details?: { reason?: string; reasons?: unknown } }).details;
    if (details?.reason === 'payment-blocked' && isSettledRefusal(details.reasons)) {
      // Settled meanwhile (e.g. by QR bill): the money sits on Stripe clearing and needs a refund by hand.
      await attemptRef.update({ state: 'overpaid', ...stripeIds, error: `invoice cannot take the payment: ${String(details.reasons)}`, updatedAt: toStoreDateTime(deps.now()) });
      deps.log('error', 'stripeHandler: payment on a settled invoice, refund by hand', { attemptKey, invoiceKey, paymentIntentId, amount });
      return { state: 'handled', tenantId: operatorTenantId };
    }
    throw err;
  }

  // 3. the Stripe fee: debit fee expense, credit Stripe clearing (idempotent on the booking key)
  const fee = await deps.port().feeOfCharge(chargeId);
  let feeBookingKey = '';
  if (fee > 0) {
    const feeAccountKey = String(config['stripeFeeAccountKey'] ?? '');
    if (!feeAccountKey) throw new Error(`${accountingTenantId} has no stripeFeeAccountKey for a Stripe fee`);
    feeBookingKey = `stripe-fee-${paymentIntentId}`;
    await writeFeeBooking(db, {
      operatorTenantId, accountingTenantId, invoiceKey, bookingKey: feeBookingKey, date, fee, feeAccountKey, clearingKey,
      fiscalYearStart: Number(config['fiscalYearStart'] ?? 1) || 1,
    });
  }

  // 4. the payer agreed to save the method in Checkout: store it like a setup session would (before the attempt
  //    is marked succeeded, so a retry after a failure here saves it again)
  if (attempt.offerSave && action.paymentMethodId) {
    await saveMethod(db, deps, attempt.payerTenantId, action.paymentMethodId, action.customerId);
  }

  // 5. the attempt is done
  await attemptRef.update({ state: 'succeeded', ...stripeIds, fee, paymentBookingKey, feeBookingKey, error: mismatch, updatedAt: toStoreDateTime(deps.now()) });
  deps.log('info', 'stripeHandler: payment recorded', { attemptKey, invoiceKey, amount, fee });
  return { state: 'handled', tenantId: operatorTenantId };
}

interface FeeBookingInput {
  operatorTenantId: string;
  accountingTenantId: string;
  invoiceKey: string;
  bookingKey: string;
  date: string;
  fee: number;
  feeAccountKey: string;
  clearingKey: string;
  fiscalYearStart: number;
}

/** Same writer shape as postInvoicePayment's payment booking; a booking that already exists is left alone. */
async function writeFeeBooking(db: Firestore, input: FeeBookingInput): Promise<void> {
  const { operatorTenantId, accountingTenantId, invoiceKey, bookingKey, date, fee, feeAccountKey, clearingKey, fiscalYearStart } = input;
  const invoiceRef = db.collection('invoices').doc(invoiceKey);
  const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);
  const ccCtx = await loadCostCenterContext(db, operatorTenantId, accountingTenantId, [feeAccountKey, clearingKey]);
  await db.runTransaction(async tx => {
    if ((await tx.get(bookingRef)).exists) return;
    const invoice = (await tx.get(invoiceRef)).data() ?? {};
    await assertPeriodsOpen(db, touchedPeriodKeys(accountingTenantId, [date], fiscalYearStart), tx);
    await assertLeafAccount(db, accountingTenantId, feeAccountKey, tx);
    await assertLeafAccount(db, accountingTenantId, clearingKey, tx);
    const bookingNo = await allocateBookingNo(db, tx, accountingTenantId, Number(date.substring(0, 4)));

    const tenants = [operatorTenantId];
    const invoiceId = String(invoice['invoiceId'] ?? '');
    const title = `Stripe-Gebühr Rechnung ${invoiceId}`;
    tx.set(bookingRef, withoutUndefined({
      tenants, accountingTenantId, isArchived: false,
      title, date, notes: `stripe-fee:${bookingKey.replace(/^stripe-fee-/, '')}`, tags: 'stripe-fee', index: invoiceBookingIndex(date, bookingNo, title, invoiceId),
      bookingNo, status: 'posted', periodKey: periodKeyFor(accountingTenantId, date, fiscalYearStart), documentKeys: [],
    }));
    feeBookingLines(feeAccountKey, clearingKey, fee).forEach((line, i) => {
      const costCenterKey = costCenterKeyForLine(ccCtx, line.accountKey, { explicit: '' });
      tx.set(db.collection(BOOKING_LINE_COLLECTION).doc(`${bookingKey}-${i}`), withoutUndefined({
        tenants, accountingTenantId, isArchived: false, bookingKey, accountKey: line.accountKey,
        ...(costCenterKey ? { costCenterKey } : {}),
        ...(line.debitAmount ? { debitAmount: { ...line.debitAmount, periodicity: 'one-time' } } : {}),
        ...(line.creditAmount ? { creditAmount: { ...line.creditAmount, periodicity: 'one-time' } } : {}),
      }));
    });
  });
}

async function paymentFailed(
  db: Firestore, deps: StripeHandlerDeps, action: Extract<StripeAction, { kind: 'payment-failed' }>,
): Promise<WebhookOutcome> {
  const attempt = await loadAttempt(db, action.attemptKey);
  if (SETTLED_STATES.includes(attempt.state)) return { state: 'ignored', tenantId: operatorOf(attempt) };
  await db.collection(PaymentAttemptCollection).doc(action.attemptKey).update({
    state: 'failed', error: action.error, updatedAt: toStoreDateTime(deps.now()),
    ...(action.paymentIntentId ? { stripePaymentIntentId: action.paymentIntentId } : {}),
  });
  await onTopUpChargeFailed(db, deps, action.attemptKey, attempt);
  deps.log('warn', 'stripeHandler: payment failed', { attemptKey: action.attemptKey, error: action.error });
  return { state: 'handled', tenantId: operatorOf(attempt) };
}

/**
 * A failed off-session top-up charge (auto top-up, plan 1.149 Task 9): auto top-up is switched off on the payer's
 * subscription, the pending top-up is cleared so a new one can start once it is switched on again, and the
 * payer's admin is told. A top-up paid by hand in Checkout changes nothing here: the payer saw the decline.
 * Every step is idempotent (Stripe retries; the mail is queued once per attempt).
 */
async function onTopUpChargeFailed(
  db: Firestore, deps: StripeHandlerDeps, attemptKey: string, attempt: Attempt,
): Promise<void> {
  if (attempt.purpose !== 'topup' || !attempt.offSession) return;
  const payer = attempt.payerTenantId;
  await switchOffAutoTopUp(db, payer);
  await clearAutoTopUp(db, payer, attempt.invoiceKey);
  try {
    await deps.notifyTopUpFailed?.(payer, { attemptKey, invoiceKey: attempt.invoiceKey, amount: attempt.amount });
  } catch (err) {
    // The switch-off stands; a missing mail must not make Stripe retry the whole event.
    deps.log('error', 'stripeHandler: could not notify the failed auto top-up', { attemptKey, payer, error: err instanceof Error ? err.message : String(err) });
  }
  deps.log('warn', 'stripeHandler: auto top-up failed, switched off', { attemptKey, payer, invoiceKey: attempt.invoiceKey });
}

async function expireAttempt(db: Firestore, deps: StripeHandlerDeps, attemptKey: string): Promise<void> {
  const ref = db.collection(PaymentAttemptCollection).doc(attemptKey);
  const attempt = (await ref.get()).data() as Attempt | undefined;
  if (!attempt || attempt.state !== 'open') return;
  await ref.update({ state: 'expired', updatedAt: toStoreDateTime(deps.now()) });
}

async function methodSaved(
  db: Firestore, deps: StripeHandlerDeps, action: Extract<StripeAction, { kind: 'method-saved' }>,
): Promise<WebhookOutcome> {
  const resolve = async () => action.paymentMethodId || deps.port().setupIntentPaymentMethod(action.setupIntentId);
  const saved = await saveMethod(db, deps, action.tenantId, resolve, action.customerId);
  return saved ? { state: 'handled', tenantId: action.tenantId } : { state: 'ignored', tenantId: action.tenantId };
}

/**
 * Stores a payment method on subscriptions/{tenantId} with autopay on and detaches a different previous one
 * (best effort). Refuses (false, error log) when the Stripe customer is not the subscription's; that check runs
 * before Stripe is asked anything. `method` is the id, or a resolver for it (a setup session's intent).
 */
async function saveMethod(
  db: Firestore, deps: StripeHandlerDeps, tenantId: string, method: string | (() => Promise<string>), customerId: string,
): Promise<boolean> {
  const sub = await ensureSubscription(db, tenantId);
  const expectedCustomer = String(sub['stripeCustomerId'] ?? '');
  if (!customerId || customerId !== expectedCustomer) {
    deps.log('error', 'stripeHandler: payment method of another Stripe customer, not saved', { tenantId, customerId, expectedCustomer });
    return false;
  }
  const port = deps.port();
  const paymentMethodId = typeof method === 'string' ? method : await method();
  const display = await port.paymentMethodDisplay(paymentMethodId);
  const previous = String((sub['paymentMethod'] as { stripePaymentMethodId?: string } | null | undefined)?.stripePaymentMethodId ?? '');
  await db.collection(SubscriptionCollection).doc(tenantId).update({
    paymentMethod: { ...display, consentAt: toStoreDateTime(deps.now()) },
    autopay: true,
  });
  if (previous && previous !== paymentMethodId) {
    try {
      await port.detachPaymentMethod(previous);
    } catch (err) {
      // Best effort: the new method is stored; a stale one left at Stripe is never charged by us.
      deps.log('warn', 'stripeHandler: could not detach the previous payment method', { tenantId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  deps.log('info', 'stripeHandler: payment method saved', { tenantId, type: display.type });
  return true;
}

export const stripeHandler: WebhookHandler = makeStripeHandler({
  db: () => getFirestore(),
  port: () => stripePort(),
  now: () => new Date(),
  log: (level, message, data) => logger[level](message, data),
  notifyTopUpFailed: (payerTenantId, topUp) => notifyAutoTopUpFailed(getFirestore(), payerTenantId, topUp),
});
