// apps/functions/src/collection/stripe-webhook.logic.ts
//
// Pure half of the Stripe webhook (plan 1.149 Task 7): which Stripe event means what for us.
// No Firestore, no Stripe SDK. The handler in stripe-webhook.ts acts on the result.
import { toStoreDate } from '../srv/zurich-time';

export type StripeAction =
  /** A setup session finished. `paymentMethodId` is '' unless the event carries it; the handler then asks Stripe via `setupIntentId`. */
  | { kind: 'method-saved'; tenantId: string; paymentMethodId: string; setupIntentId: string }
  | { kind: 'payment-succeeded'; attemptKey: string; paymentIntentId: string; chargeId: string; amount: number; date: string }
  | { kind: 'payment-failed'; attemptKey: string; paymentIntentId: string; error: string }
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
      return { kind: 'method-saved', tenantId, paymentMethodId, setupIntentId };
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
      };
    }
    case 'payment_intent.payment_failed': {
      if (!attemptKey) return { kind: 'ignore', reason: 'payment intent without metadata.attemptKey' };
      const lastError = isObject(object['last_payment_error']) ? object['last_payment_error'] : {};
      const error = str(lastError['message']) || str(lastError['code']) || 'payment failed';
      return { kind: 'payment-failed', attemptKey, paymentIntentId: str(object['id']), error };
    }
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

/** Debit the fee expense, credit the Stripe clearing account. */
export function feeBookingLines(feeAccountKey: string, clearingAccountKey: string, fee: number) {
  return [
    { accountKey: feeAccountKey, debitAmount: { amount: fee, currency: 'CHF' } },
    { accountKey: clearingAccountKey, creditAmount: { amount: fee, currency: 'CHF' } },
  ];
}
