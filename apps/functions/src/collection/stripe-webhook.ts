// apps/functions/src/collection/stripe-webhook.ts
//
// Stripe on the shared webhook receiver (_webhooks), plan 1.149 Task 7. Stripe is only a payment
// processor behind our own invoice: a succeeded PaymentIntent is recorded as a payment on that invoice
// (postInvoicePayment, Stripe clearing account as the bank) and its fee is booked separately. A finished
// setup session stores the tenant's payment method. Every effect is idempotent: Stripe retries, and the
// replay script may run a row again.
//
// The credit for a paid top-up is NOT written here: Task 9's invoice trigger handles Stripe and QR alike.
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
import { ensureSubscription } from './payment-method';
import { platformBilling } from './platform';
import { stripePort, stripeWebhookSecret } from './stripe-port';
import type { StripePort } from './stripe-port';
import { feeBookingLines, isSettledRefusal, stripeActionOf, stripePaymentId } from './stripe-webhook.logic';
import type { StripeAction } from './stripe-webhook.logic';

export type { StripeAction } from './stripe-webhook.logic';
export { stripeActionOf } from './stripe-webhook.logic';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const stripeClient: WebhookClient = {
  id: 'stripe',
  type: 'stripe',
  auth: { kind: 'stripe-signature', secret: stripeWebhookSecret, toleranceSec: 300 },
  tenant: { scope: 'platform' },
  split: raw => [JSON.parse(raw.toString('utf8')) as unknown],
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

async function paymentSucceeded(
  db: Firestore, deps: StripeHandlerDeps, action: Extract<StripeAction, { kind: 'payment-succeeded' }>,
): Promise<WebhookOutcome> {
  const { attemptKey, paymentIntentId, chargeId, amount, date } = action;
  const attemptRef = db.collection(PaymentAttemptCollection).doc(attemptKey);
  // 1. idempotency: a settled attempt has nothing left to do
  const attempt = await loadAttempt(db, attemptKey);
  if (SETTLED_STATES.includes(attempt.state)) return { state: 'ignored', tenantId: operatorOf(attempt) };
  if (!paymentIntentId || !chargeId) throw new Error(`Stripe payment for attempt ${attemptKey} has no PaymentIntent or charge`);

  const { operatorTenantId, accountingTenantId } = await platformBilling(db);
  const invoiceKey = attempt.invoiceKey;
  const config = await loadOwnedAccountingConfig(db, operatorTenantId, invoiceKey, accountingTenantId, 'paid');
  const clearingKey = String(config['stripeClearingAccountKey'] ?? '');
  if (!clearingKey) throw new Error(`${accountingTenantId} has no stripeClearingAccountKey: Stripe collection is not set up`);
  const stripeIds = { stripePaymentIntentId: paymentIntentId, stripeChargeId: chargeId };

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

  // 4. the attempt is done
  await attemptRef.update({ state: 'succeeded', ...stripeIds, fee, paymentBookingKey, feeBookingKey, error: '', updatedAt: toStoreDateTime(deps.now()) });
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
  await onTopUpChargeFailed(db, attempt, action);
  deps.log('warn', 'stripeHandler: payment failed', { attemptKey: action.attemptKey, error: action.error });
  return { state: 'handled', tenantId: operatorOf(attempt) };
}

/**
 * Branch point for Task 9: a failed off-session top-up charge (auto top-up) will switch autopay off and
 * notify the tenant here. A no-op today.
 */
async function onTopUpChargeFailed(_db: Firestore, attempt: Attempt, _action: Extract<StripeAction, { kind: 'payment-failed' }>): Promise<void> {
  if (attempt.purpose !== 'topup' || !attempt.offSession) return;
  // Task 9
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
  const { tenantId } = action;
  const port = deps.port();
  const paymentMethodId = action.paymentMethodId || (await port.setupIntentPaymentMethod(action.setupIntentId));
  const display = await port.paymentMethodDisplay(paymentMethodId);
  const sub = await ensureSubscription(db, tenantId);
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
  return { state: 'handled', tenantId };
}

export const stripeHandler: WebhookHandler = makeStripeHandler({
  db: () => getFirestore(),
  port: () => stripePort(),
  now: () => new Date(),
  log: (level, message, data) => logger[level](message, data),
});
