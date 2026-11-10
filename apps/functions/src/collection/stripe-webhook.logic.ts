// apps/functions/src/collection/stripe-webhook.logic.ts
//
// Pure half of the Stripe webhook (plan 1.149 Task 7): which Stripe event means what for us.
// No Firestore, no Stripe SDK. The handler in stripe-webhook.ts acts on the result.
import { toStoreDate } from '../srv/zurich-time';

export type StripeAction =
  /** A setup session finished. `paymentMethodId` is '' unless the event carries it; the handler then asks Stripe via `setupIntentId`. */
  | { kind: 'method-saved'; tenantId: string; paymentMethodId: string; setupIntentId: string; customerId: string }
  /** `currency` lower-case as Stripe sends it; `paymentMethodId`/`customerId` '' when absent (used to save the method on offerSave). */
  | {
      kind: 'payment-succeeded'; attemptKey: string; paymentIntentId: string; chargeId: string; amount: number; date: string;
      currency: string; paymentMethodId: string; customerId: string;
    }
  | { kind: 'payment-failed'; attemptKey: string; paymentIntentId: string; error: string }
  /**
   * A charge was (partly) refunded. `amountRefunded` is cumulative over all its refunds; the handler lists the
   * refunds themselves and books each once. `attemptKey` '' when the charge carries no metadata.
   */
  | { kind: 'charge-refunded'; chargeId: string; paymentIntentId: string; attemptKey: string; amountRefunded: number; currency: string }
  /** A refund changed state; the handler acts on `failed` / `canceled` (the money came back to the Stripe balance). */
  | {
      kind: 'refund-updated'; refundId: string; chargeId: string; paymentIntentId: string; attemptKey: string;
      amount: number; currency: string; status: string; date: string;
    }
  /** A dispute (chargeback) was opened: Stripe has already taken the amount and the fee off the balance. */
  | { kind: 'dispute-opened'; disputeId: string; chargeId: string; paymentIntentId: string; attemptKey: string; amount: number; reason: string }
  /** A dispute was closed. `fee` = the fees of its balance transactions, `feeCurrencies` their currencies (lower-case). */
  | {
      kind: 'dispute-closed'; disputeId: string; chargeId: string; paymentIntentId: string; attemptKey: string; status: string;
      amount: number; fee: number; currency: string; feeCurrencies: string[]; date: string;
    }
  /** `expireAttemptKey`: an expired payment session; the handler marks that attempt `expired` (if still open). */
  | { kind: 'ignore'; reason: string; expireAttemptKey?: string };

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const idOf = (v: unknown): string => (typeof v === 'string' ? v : isObject(v) ? str(v['id']) : '');

/** A Unix time in seconds as the Europe/Zurich StoreDate, '' when missing. */
function storeDateOfUnix(sec: number): string {
  return sec > 0 ? toStoreDate(new Date(sec * 1000)) : '';
}

/** The idempotency key for postInvoicePayment: 'stripe' + the PaymentIntent id, letters and digits only, at most 32. */
export function stripePaymentId(paymentIntentId: string): string {
  return `stripe${paymentIntentId}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 32);
}

/** Pure: Stripe event JSON → what to do. Never throws; anything unexpected is an `ignore` with a reason. */
export function stripeActionOf(event: unknown): StripeAction {
  if (!isObject(event)) return { kind: 'ignore', reason: 'not an event object' };
  const type = str(event['type']);
  const object = isObject(event['data']) ? event['data']['object'] : undefined;
  if (!isObject(object)) return { kind: 'ignore', reason: `event ${type || '(no type)'} has no data.object` };
  const metadata = isObject(object['metadata']) ? object['metadata'] : {};
  const attemptKey = str(metadata['attemptKey']);

  switch (type) {
    case 'checkout.session.completed': {
      // Payment sessions are recorded by payment_intent.succeeded, which also covers off-session charges.
      if (object['mode'] !== 'setup') return { kind: 'ignore', reason: `checkout session completed in mode ${str(object['mode'])}` };
      const tenantId = str(metadata['tenantId']);
      if (!tenantId) return { kind: 'ignore', reason: 'setup session without metadata.tenantId' };
      const setupIntent = object['setup_intent'];
      const setupIntentId = idOf(setupIntent);
      const paymentMethodId = isObject(setupIntent) ? idOf(setupIntent['payment_method']) : '';
      if (!setupIntentId && !paymentMethodId) return { kind: 'ignore', reason: 'setup session without a setup intent' };
      return { kind: 'method-saved', tenantId, paymentMethodId, setupIntentId, customerId: idOf(object['customer']) };
    }
    case 'payment_intent.succeeded': {
      if (!attemptKey) return { kind: 'ignore', reason: 'payment intent without metadata.attemptKey' };
      const charge = object['latest_charge'];
      // The charge's own time when it is expanded; otherwise the event's, which Stripe stamps when the charge succeeds.
      const created = isObject(charge) && num(charge['created']) > 0 ? num(charge['created']) : num(event['created']);
      return {
        kind: 'payment-succeeded',
        attemptKey,
        paymentIntentId: str(object['id']),
        chargeId: idOf(charge),
        amount: num(object['amount_received']) || num(object['amount']),
        date: storeDateOfUnix(created),
        currency: str(object['currency']).toLowerCase(),
        paymentMethodId: idOf(object['payment_method']),
        customerId: idOf(object['customer']),
      };
    }
    case 'payment_intent.payment_failed': {
      if (!attemptKey) return { kind: 'ignore', reason: 'payment intent without metadata.attemptKey' };
      const lastError = isObject(object['last_payment_error']) ? object['last_payment_error'] : {};
      const error = str(lastError['message']) || str(lastError['code']) || 'payment failed';
      return { kind: 'payment-failed', attemptKey, paymentIntentId: str(object['id']), error };
    }
    case 'charge.refunded': {
      const chargeId = str(object['id']);
      if (!chargeId) return { kind: 'ignore', reason: 'refunded charge without an id' };
      return {
        kind: 'charge-refunded', chargeId, paymentIntentId: idOf(object['payment_intent']), attemptKey,
        amountRefunded: num(object['amount_refunded']), currency: str(object['currency']).toLowerCase(),
      };
    }
    case 'charge.refund.updated': {
      const refundId = str(object['id']);
      const chargeId = idOf(object['charge']);
      if (!refundId || !chargeId) return { kind: 'ignore', reason: 'refund update without a refund or charge id' };
      return {
        kind: 'refund-updated', refundId, chargeId, paymentIntentId: idOf(object['payment_intent']), attemptKey,
        amount: num(object['amount']), currency: str(object['currency']).toLowerCase(), status: str(object['status']),
        date: storeDateOfUnix(num(event['created'])),
      };
    }
    case 'charge.dispute.created':
    case 'charge.dispute.closed': {
      const disputeId = str(object['id']);
      const chargeId = idOf(object['charge']);
      if (!disputeId || !chargeId) return { kind: 'ignore', reason: `${type} without a dispute or charge id` };
      const ids = { disputeId, chargeId, paymentIntentId: idOf(object['payment_intent']), attemptKey };
      if (type === 'charge.dispute.created') return { kind: 'dispute-opened', ...ids, amount: num(object['amount']), reason: str(object['reason']) };
      const txns = Array.isArray(object['balance_transactions']) ? object['balance_transactions'].filter(isObject) : [];
      return {
        kind: 'dispute-closed', ...ids, status: str(object['status']), amount: num(object['amount']),
        fee: txns.reduce((sum, t) => sum + num(t['fee']), 0), currency: str(object['currency']).toLowerCase(),
        feeCurrencies: [...new Set(txns.map(t => str(t['currency']).toLowerCase()))], date: storeDateOfUnix(num(event['created'])),
      };
    }
    case 'payout.paid':
      return { kind: 'ignore', reason: 'payout: matched by the bank import' };
    case 'checkout.session.expired':
      return attemptKey
        ? { kind: 'ignore', reason: 'checkout session expired', expireAttemptKey: attemptKey }
        : { kind: 'ignore', reason: 'checkout session expired without an attempt' };
    default:
      return { kind: 'ignore', reason: `event type ${type}` };
  }
}

/**
 * A `payment-blocked` refusal whose reasons mean "this invoice cannot take the money any more" (already
 * settled, e.g. by QR bill, or no longer payable): the attempt becomes `overpaid` and needs a refund by hand.
 */
export function isSettledRefusal(reasons: unknown): boolean {
  return Array.isArray(reasons) && (reasons.includes('overpayment') || reasons.includes('not-payable'));
}

/** A two-line CHF booking: debit one account, credit the other with the same amount (Rappen). */
export function transferLines(debitAccountKey: string, creditAccountKey: string, amount: number) {
  return [
    { accountKey: debitAccountKey, debitAmount: { amount, currency: 'CHF' } },
    { accountKey: creditAccountKey, creditAmount: { amount, currency: 'CHF' } },
  ];
}

/** Debit the fee expense, credit the Stripe clearing account. */
export function feeBookingLines(feeAccountKey: string, clearingAccountKey: string, fee: number) {
  return transferLines(feeAccountKey, clearingAccountKey, fee);
}

/**
 * The settled state an attempt returns to when a dispute does not end in a loss: a payment posted to an invoice
 * → succeeded; money held on prepayment (overpaid or top-up) → refunded when a refund of it left Stripe,
 * else overpaid (never posted) or succeeded (top-up).
 */
export function attemptStateAfterDispute(
  attempt: { purpose: string; paymentBookingKey: string }, refunded: boolean,
): 'succeeded' | 'overpaid' | 'refunded' {
  const onPrepayment = attempt.purpose === 'topup' || !attempt.paymentBookingKey;
  if (!onPrepayment) return 'succeeded';
  if (refunded) return 'refunded';
  return attempt.paymentBookingKey ? 'succeeded' : 'overpaid';
}

/** The fields of `data.object` the logic reads; everything else (customer_details, billing details, charges …) is dropped. */
const KEPT_OBJECT_FIELDS = [
  'id', 'object', 'mode', 'status', 'metadata', 'payment_intent', 'setup_intent', 'customer', 'payment_method',
  'amount', 'amount_received', 'currency', 'latest_charge', 'created', 'last_payment_error',
  // charge (charge.refunded), refund, dispute (charge.dispute.*): no card, billing or evidence details
  'charge', 'amount_refunded', 'reason', 'balance_transactions',
] as const;

/** A string metadata map only (Stripe metadata values are strings). */
function stringMap(v: unknown): Record<string, string> {
  if (!isObject(v)) return {};
  return Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string'));
}

/**
 * The stored shape of a Stripe event: `id`, `type`, `created` and a reduced `data.object`. Keeps personal data
 * (names, emails, addresses) out of webhook-events and avoids nested arrays Firestore rejects. Pure.
 */
export function reduceStripeEvent(event: unknown): Record<string, unknown> {
  if (!isObject(event)) throw new Error('Stripe event is not an object');
  const source = isObject(event['data']) && isObject(event['data']['object']) ? event['data']['object'] : {};
  const object: Record<string, unknown> = {};
  for (const k of KEPT_OBJECT_FIELDS) {
    const v = source[k];
    if (v === undefined || v === null) continue;
    if (k === 'metadata') object[k] = stringMap(v);
    else if (k === 'latest_charge') object[k] = isObject(v) ? { id: idOf(v), created: num(v['created']) } : v;
    else if (k === 'setup_intent') object[k] = isObject(v) ? { id: idOf(v), payment_method: idOf(v['payment_method']) } : v;
    else if (k === 'last_payment_error') object[k] = isObject(v) ? { message: str(v['message']) } : {};
    else if (k === 'balance_transactions') object[k] = Array.isArray(v) ? v.filter(isObject).map(t => ({ fee: num(t['fee']), currency: str(t['currency']) })) : [];
    else if (k === 'payment_intent' || k === 'customer' || k === 'payment_method' || k === 'charge') object[k] = idOf(v);
    else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') object[k] = v;
  }
  return { id: str(event['id']), type: str(event['type']), created: num(event['created']), data: { object } };
}
