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
//
// Plan 2 Task 10 (design §7.7): money that arrives on a settled invoice (`overpaid`) is booked clearing →
// prepayment; a refund of such money or of a top-up is booked prepayment → clearing, once per refund id; a refund
// of a payment posted to an invoice is only flagged (Storno by hand). A dispute marks the attempt; a lost one
// books amount + fee to the fee account. payout.paid is left to the bank import.
import { logger } from 'firebase-functions/v2';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
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
import { toStoreDate, toStoreDateTime } from '../srv/zurich-time';
import { clearAutoTopUp, switchOffAutoTopUp } from '../credit/auto-topup-request';
import { notifyAutoTopUpFailed } from '../credit/topup-failed-mail';
import { ensureSubscription } from './payment-method';
import { platformBilling } from './platform';
import { stripePort, stripeWebhookSecret } from './stripe-port';
import type { StripePort } from './stripe-port';
import { disputeLoss, isSettledRefusal, reduceStripeEvent, stripeActionOf, stripePaymentId, transferLines } from './stripe-webhook.logic';
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

export type StripeHandlerPort = Pick<StripePort, 'feeOfCharge' | 'paymentMethodDisplay' | 'setupIntentPaymentMethod' | 'detachPaymentMethod' | 'listRefunds'>;

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
/** Attempt states a late failure / expiry / replayed success must not overwrite: the money has been placed. */
const SETTLED_STATES = ['succeeded', 'overpaid', 'refunded', 'disputed'];
/** Refunds that have left the Stripe balance (a pending one is already deducted); failed / canceled ones returned. */
const BOOKED_REFUND_STATES = ['succeeded', 'pending'];
/** Operator flags on subscriptions/{payer}.billingFlags (added with arrayUnion, cleared by the operator). */
type StripeFlag = 'overpaid' | 'disputed' | 'refund-on-posted-payment';

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
      case 'charge-refunded':
        return chargeRefunded(db, deps, action);
      case 'dispute-opened':
        return disputeOpened(db, deps, action);
      case 'dispute-closed':
        return disputeClosed(db, deps, action);
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
 * The attempt a charge / refund / dispute belongs to: by metadata.attemptKey when the object carries it, else by
 * the PaymentIntent, else by the charge (both stored on the attempt when the payment was recorded). Throws for an
 * unknown charge (reported, replayable).
 */
async function findAttempt(
  db: Firestore, ids: { attemptKey: string; paymentIntentId: string; chargeId: string },
): Promise<{ key: string; attempt: Attempt }> {
  const col = db.collection(PaymentAttemptCollection);
  if (ids.attemptKey) {
    const snap = await col.doc(ids.attemptKey).get();
    if (snap.exists) return { key: ids.attemptKey, attempt: snap.data() as Attempt };
  }
  for (const [field, value] of [['stripePaymentIntentId', ids.paymentIntentId], ['stripeChargeId', ids.chargeId]] as const) {
    if (!value) continue;
    const found = await col.where(field, '==', value).limit(1).get();
    if (!found.empty) return { key: found.docs[0].id, attempt: found.docs[0].data() as Attempt };
  }
  throw new Error(`Stripe event for charge ${ids.chargeId}: no payment attempt (PaymentIntent ${ids.paymentIntentId || '(none)'})`);
}

/** Adds an operator flag on the payer's subscription (atomic, never removes others). */
async function flagPayer(db: Firestore, payerTenantId: string, flag: StripeFlag): Promise<void> {
  await db.collection(SubscriptionCollection).doc(payerTenantId).update({ billingFlags: FieldValue.arrayUnion(flag) });
}

/** The operator books' config and Stripe clearing account. */
async function operatorBooks(db: Firestore, invoiceKey: string) {
  const { operatorTenantId, accountingTenantId } = await platformBilling(db);
  const config = await loadOwnedAccountingConfig(db, operatorTenantId, invoiceKey, accountingTenantId, 'paid');
  const clearingKey = String(config['stripeClearingAccountKey'] ?? '');
  if (!clearingKey) throw new Error(`${accountingTenantId} has no stripeClearingAccountKey: Stripe collection is not set up`);
  const account = (field: 'prepaymentAccountKey' | 'stripeFeeAccountKey', purpose: string): string => {
    const key = String(config[field] ?? '');
    if (!key) throw new Error(`${accountingTenantId} has no ${field} for ${purpose}`);
    return key;
  };
  return { operatorTenantId, accountingTenantId, clearingKey, account, fiscalYearStart: Number(config['fiscalYearStart'] ?? 1) || 1 };
}

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
      // Settled meanwhile (e.g. by QR bill): the money is booked clearing → prepayment («Überzahlung») and its
      // fee as usual; it waits there for a refund by hand (charge.refunded books it back) or an offset.
      const prepaymentKey = String(config['prepaymentAccountKey'] ?? '');
      if (!prepaymentKey) throw new Error(`${accountingTenantId} has no prepaymentAccountKey for an overpaid Stripe payment`);
      const books = { operatorTenantId, accountingTenantId, invoiceKey, fiscalYearStart: Number(config['fiscalYearStart'] ?? 1) || 1 };
      await writeStripeBooking(db, {
        ...books, bookingKey: `stripe-overpaid-${paymentIntentId}`, tag: 'stripe-overpaid', ref: paymentIntentId,
        title: invoiceId => `Überzahlung Rechnung ${invoiceId}`, date, amount, debitKey: clearingKey, creditKey: prepaymentKey,
      });
      const { fee, feeBookingKey } = await bookFee(db, deps, { ...books, config, chargeId, paymentIntentId, date, clearingKey });
      await flagPayer(db, attempt.payerTenantId, 'overpaid');
      await attemptRef.update({
        state: 'overpaid', ...stripeIds, fee, feeBookingKey, error: `invoice cannot take the payment: ${String(details.reasons)}`, updatedAt: toStoreDateTime(deps.now()),
      });
      deps.log('error', 'stripeHandler: payment on a settled invoice, booked as prepayment, refund by hand', { attemptKey, invoiceKey, paymentIntentId, amount });
      return { state: 'handled', tenantId: operatorTenantId };
    }
    throw err;
  }

  // 3. the Stripe fee: debit fee expense, credit Stripe clearing (idempotent on the booking key)
  const { fee, feeBookingKey } = await bookFee(db, deps, {
    operatorTenantId, accountingTenantId, invoiceKey, config, chargeId, paymentIntentId, date, clearingKey,
    fiscalYearStart: Number(config['fiscalYearStart'] ?? 1) || 1,
  });

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

interface BooksRef {
  operatorTenantId: string;
  accountingTenantId: string;
  invoiceKey: string;
  fiscalYearStart: number;
}

/** Reads the charge's Stripe fee and books it (debit fee expense, credit clearing). Idempotent on `stripe-fee-<pi>`. */
async function bookFee(
  db: Firestore, deps: StripeHandlerDeps,
  input: BooksRef & { config: Record<string, unknown>; chargeId: string; paymentIntentId: string; date: string; clearingKey: string },
): Promise<{ fee: number; feeBookingKey: string }> {
  const fee = await deps.port().feeOfCharge(input.chargeId);
  if (fee <= 0) return { fee, feeBookingKey: '' };
  const feeAccountKey = String(input.config['stripeFeeAccountKey'] ?? '');
  if (!feeAccountKey) throw new Error(`${input.accountingTenantId} has no stripeFeeAccountKey for a Stripe fee`);
  const feeBookingKey = `stripe-fee-${input.paymentIntentId}`;
  await writeStripeBooking(db, {
    ...input, bookingKey: feeBookingKey, tag: 'stripe-fee', ref: input.paymentIntentId,
    title: invoiceId => `Stripe-Gebühr Rechnung ${invoiceId}`, amount: fee, debitKey: feeAccountKey, creditKey: input.clearingKey,
  });
  return { fee, feeBookingKey };
}

interface StripeBookingInput extends BooksRef {
  /** The booking doc id: the idempotency key (`stripe-<tag>-<Stripe id>`). */
  bookingKey: string;
  /** `tags` of the booking; `notes` = `<tag>:<ref>`. */
  tag: string;
  ref: string;
  title: (invoiceId: string) => string;
  date: string;
  amount: number;
  debitKey: string;
  creditKey: string;
}

/**
 * A posted two-line CHF booking in the operator books, same writer shape as postInvoicePayment's payment booking
 * (period lock, leaf accounts, booking number). A booking that already exists is left alone.
 */
async function writeStripeBooking(db: Firestore, input: StripeBookingInput): Promise<void> {
  const { operatorTenantId, accountingTenantId, invoiceKey, bookingKey, date, amount, debitKey, creditKey, fiscalYearStart } = input;
  if (!(amount > 0)) throw new Error(`Stripe booking ${bookingKey} has no positive amount (${amount})`);
  const invoiceRef = db.collection('invoices').doc(invoiceKey);
  const bookingRef = db.collection(BOOKING_COLLECTION).doc(bookingKey);
  const ccCtx = await loadCostCenterContext(db, operatorTenantId, accountingTenantId, [debitKey, creditKey]);
  await db.runTransaction(async tx => {
    if ((await tx.get(bookingRef)).exists) return;
    const invoice = (await tx.get(invoiceRef)).data() ?? {};
    await assertPeriodsOpen(db, touchedPeriodKeys(accountingTenantId, [date], fiscalYearStart), tx);
    await assertLeafAccount(db, accountingTenantId, debitKey, tx);
    await assertLeafAccount(db, accountingTenantId, creditKey, tx);
    const bookingNo = await allocateBookingNo(db, tx, accountingTenantId, Number(date.substring(0, 4)));

    const tenants = [operatorTenantId];
    const invoiceId = String(invoice['invoiceId'] ?? '');
    const title = input.title(invoiceId);
    tx.set(bookingRef, withoutUndefined({
      tenants, accountingTenantId, isArchived: false,
      title, date, notes: `${input.tag}:${input.ref}`, tags: input.tag, index: invoiceBookingIndex(date, bookingNo, title, invoiceId),
      bookingNo, status: 'posted', periodKey: periodKeyFor(accountingTenantId, date, fiscalYearStart), documentKeys: [],
    }));
    transferLines(debitKey, creditKey, amount).forEach((line, i) => {
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

/** The Zurich day of a Unix time, '' when missing. */
const storeDateOf = (sec: number): string => (sec > 0 ? toStoreDate(new Date(sec * 1000)) : '');

/**
 * A charge was (partly) refunded. Money that never reached an invoice (overpaid) or reached a top-up invoice sits on
 * prepayment: each refund is booked prepayment → clearing once (`stripe-refund-<refundId>`), the attempt becomes
 * `refunded`. A refund of a payment posted to an invoice is only flagged: the operator reverses it (Storno) by hand.
 */
async function chargeRefunded(
  db: Firestore, deps: StripeHandlerDeps, action: Extract<StripeAction, { kind: 'charge-refunded' }>,
): Promise<WebhookOutcome> {
  const { key, attempt } = await findAttempt(db, action);
  // Not yet recorded (succeeded webhook still to come): fail, the replay finds it settled.
  if (!SETTLED_STATES.includes(attempt.state)) throw new Error(`Stripe refund for attempt ${key} in state ${attempt.state}: payment not settled yet`);
  const refunds = (await deps.port().listRefunds(action.chargeId)).filter(r => BOOKED_REFUND_STATES.includes(r.status));
  const tenantId = operatorOf(attempt);
  const logData = { attemptKey: key, chargeId: action.chargeId, refunds: refunds.map(r => `${r.id}:${r.amount}`) };
  if (refunds.length === 0) {
    deps.log('info', 'stripeHandler: charge refunded, no refund to book', logData);
    return { state: 'handled', tenantId };
  }

  const toPrepayment = attempt.purpose === 'topup' || !attempt.paymentBookingKey;
  if (!toPrepayment) {
    await flagPayer(db, attempt.payerTenantId, 'refund-on-posted-payment');
    deps.log('error', 'stripeHandler: refund of a payment posted to an invoice, reverse it by hand (Storno)', { ...logData, invoiceKey: attempt.invoiceKey });
    return { state: 'handled', tenantId };
  }

  const books = await operatorBooks(db, attempt.invoiceKey);
  const prepaymentKey = books.account('prepaymentAccountKey', 'a Stripe refund');
  for (const r of refunds) {
    if (r.currency.toLowerCase() !== 'chf') throw new Error(`Stripe refund ${r.id} is in ${r.currency}, not chf`);
    await writeStripeBooking(db, {
      ...books, invoiceKey: attempt.invoiceKey, bookingKey: `stripe-refund-${r.id}`, tag: 'stripe-refund', ref: r.id,
      title: invoiceId => `Stripe-Rückerstattung Rechnung ${invoiceId}`, date: storeDateOf(r.created) || toStoreDate(deps.now()),
      amount: r.amount, debitKey: prepaymentKey, creditKey: books.clearingKey,
    });
  }
  if (attempt.state !== 'refunded') {
    await db.collection(PaymentAttemptCollection).doc(key).update({ state: 'refunded', updatedAt: toStoreDateTime(deps.now()) });
  }
  if (attempt.purpose === 'topup') {
    // The credit entry of the top-up stays: the operator corrects the credit balance (manual correction entry).
    deps.log('warn', 'stripeHandler: top-up refunded, correct the credit balance by hand', { ...logData, payer: attempt.payerTenantId });
  } else {
    deps.log('info', 'stripeHandler: refund booked', logData);
  }
  return { state: 'handled', tenantId };
}

/** A dispute was opened: the attempt becomes `disputed` and the payer is flagged for the operator. Nothing is booked yet. */
async function disputeOpened(
  db: Firestore, deps: StripeHandlerDeps, action: Extract<StripeAction, { kind: 'dispute-opened' }>,
): Promise<WebhookOutcome> {
  const { key, attempt } = await findAttempt(db, action);
  if (attempt.state !== 'disputed') {
    await db.collection(PaymentAttemptCollection).doc(key).update({
      state: 'disputed', error: `dispute ${action.disputeId}: ${action.reason || 'no reason'}`, updatedAt: toStoreDateTime(deps.now()),
    });
  }
  await flagPayer(db, attempt.payerTenantId, 'disputed');
  deps.log('error', 'stripeHandler: payment disputed', { attemptKey: key, disputeId: action.disputeId, amount: action.amount, reason: action.reason });
  return { state: 'handled', tenantId: operatorOf(attempt) };
}

/**
 * A dispute was closed. Lost: the disputed amount and Stripe's fee are booked fee account → clearing once
 * (`stripe-dispute-<id>`), the attempt stays `disputed`. Otherwise (won, inquiry closed): nothing is booked and the
 * attempt returns to the state it had (posted → succeeded, else overpaid).
 */
async function disputeClosed(
  db: Firestore, deps: StripeHandlerDeps, action: Extract<StripeAction, { kind: 'dispute-closed' }>,
): Promise<WebhookOutcome> {
  const { key, attempt } = await findAttempt(db, action);
  const tenantId = operatorOf(attempt);
  if (action.status !== 'lost') {
    if (attempt.state === 'disputed') {
      const back = attempt.paymentBookingKey ? 'succeeded' : 'overpaid';
      await db.collection(PaymentAttemptCollection).doc(key).update({ state: back, error: `dispute ${action.disputeId}: ${action.status}`, updatedAt: toStoreDateTime(deps.now()) });
    }
    deps.log('info', `stripeHandler: dispute closed (${action.status})`, { attemptKey: key, disputeId: action.disputeId });
    return { state: 'handled', tenantId };
  }
  const foreign = [action.currency, ...action.feeCurrencies].filter(c => c !== 'chf');
  if (foreign.length > 0) throw new Error(`Stripe dispute ${action.disputeId} is in ${foreign.join(', ')}, not chf`);
  const books = await operatorBooks(db, attempt.invoiceKey);
  const loss = disputeLoss(action.amount, action.fee);
  await writeStripeBooking(db, {
    ...books, invoiceKey: attempt.invoiceKey, bookingKey: `stripe-dispute-${action.disputeId}`, tag: 'stripe-dispute', ref: action.disputeId,
    title: invoiceId => `Stripe-Rückbuchung verloren Rechnung ${invoiceId}`, date: action.date || toStoreDate(deps.now()),
    amount: loss, debitKey: books.account('stripeFeeAccountKey', 'a lost Stripe dispute'), creditKey: books.clearingKey,
  });
  if (attempt.state !== 'disputed') {
    await db.collection(PaymentAttemptCollection).doc(key).update({ state: 'disputed', updatedAt: toStoreDateTime(deps.now()) });
  }
  await flagPayer(db, attempt.payerTenantId, 'disputed');
  deps.log('error', 'stripeHandler: dispute lost, booked', { attemptKey: key, disputeId: action.disputeId, loss, invoiceKey: attempt.invoiceKey });
  return { state: 'handled', tenantId };
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
