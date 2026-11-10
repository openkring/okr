// apps/functions/src/collection/charge-readback.ts
//
// The read-back before an off-session RE-charge (plan 1.149 Task 9, reused by plan 2 Task 5's retries). Stripe's
// idempotency keys expire after 24 h, so a charge repeated a day later is a new charge: before it, the earlier
// PaymentIntent of the same invoice is read back (by the attempt's stored id, else by a search on
// metadata.invoiceKey — the charge call may have thrown after Stripe created it).
import type { Firestore } from 'firebase-admin/firestore';

import { PI_IN_FLIGHT } from './stripe-port';
import type { PaymentIntentInfo, StripePort } from './stripe-port';
import { settleSucceededPayment } from './stripe-webhook';
import type { StripeHandlerPort } from './stripe-webhook';
import { toStoreDate } from '../srv/zurich-time';

type Log = (level: 'info' | 'warn' | 'error', message: string, data: Record<string, unknown>) => void;

/** What the read-back needs of Stripe: reading a PaymentIntent back, and the webhook's settle path. */
export type ReadBackPort = Pick<StripePort, 'retrievePaymentIntent' | 'findPaymentIntentByInvoiceKey'> & StripeHandlerPort;

/**
 * - `settled`: the earlier charge had succeeded (its webhook did not arrive); it was recorded through the webhook's
 *   settle path (payment, fee, attempt) — do not charge.
 * - `in-flight`: the earlier charge may still bring the money (processing, requires_action, …) — do not charge.
 * - `charge`: requires_payment_method, canceled or none found — charge again (with a new idempotency key).
 */
export type ReadBackOutcome = { outcome: 'settled' | 'in-flight' | 'charge'; intent: PaymentIntentInfo | null };

export async function readBackEarlierCharge(
  db: Firestore, port: ReadBackPort,
  input: { attemptKey: string; paymentIntentId: string; invoiceKey: string }, log: Log,
): Promise<ReadBackOutcome> {
  const intent = input.paymentIntentId
    ? await port.retrievePaymentIntent(input.paymentIntentId)
    : await port.findPaymentIntentByInvoiceKey(input.invoiceKey);
  if (intent?.status === 'succeeded') {
    await settleSucceededPayment(db, { db: () => db, port: () => port, now: () => new Date(), log }, {
      kind: 'payment-succeeded', attemptKey: input.attemptKey, paymentIntentId: intent.id, chargeId: intent.chargeId,
      amount: intent.amountReceived, date: toStoreDate(new Date(intent.created * 1000)), currency: intent.currency,
      paymentMethodId: '', customerId: '',
    });
    return { outcome: 'settled', intent };
  }
  if (intent && PI_IN_FLIGHT.includes(intent.status)) return { outcome: 'in-flight', intent };
  return { outcome: 'charge', intent };
}
