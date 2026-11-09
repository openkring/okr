import { defineSecret } from 'firebase-functions/params';
import Stripe from 'stripe';
import type { SavedPaymentMethod } from '@okr/shared-models';

export const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
export const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

/** What we read back of a PaymentIntent. `amountReceived` in Rappen, `created` in Unix seconds. */
export interface PaymentIntentInfo {
  id: string;
  status: string;
  amountReceived: number;
  chargeId: string;
  created: number;
  currency: string;
}

/**
 * The only door to Stripe. Stripe is a pure payment processor behind our own invoice: no Stripe
 * Invoices, Subscriptions or Prices. Amounts are integer Rappen (= Stripe's CHF minor unit).
 */
export interface StripePort {
  /** Creates the customer or updates its name. `email` '' = none on create, unchanged on update. */
  ensureCustomer(input: { tenantId: string; name: string; email: string; existingId: string }): Promise<string>;
  createSetupSession(input: { customerId: string; tenantId: string; successUrl: string; cancelUrl: string }): Promise<{ id: string; url: string }>;
  createPaymentSession(input: {
    customerId: string;
    amount: number;
    description: string;
    metadata: Record<string, string>;
    successUrl: string;
    cancelUrl: string;
    offerSave: boolean;
  }): Promise<{ id: string; url: string }>;
  chargeOffSession(input: {
    customerId: string;
    paymentMethodId: string;
    amount: number;
    description: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<{ id: string; status: string; chargeId: string }>;
  paymentMethodDisplay(paymentMethodId: string): Promise<SavedPaymentMethod>;
  /** The payment method a finished SetupIntent saved (the webhook's checkout.session.completed only names the intent). */
  setupIntentPaymentMethod(setupIntentId: string): Promise<string>;
  feeOfCharge(chargeId: string): Promise<number /* Rappen */>;
  detachPaymentMethod(paymentMethodId: string): Promise<void>;
  /** Expires an open Checkout session; an already expired or completed one is not an error. */
  expireSession(sessionId: string): Promise<void>;
  retrievePaymentIntent(id: string): Promise<PaymentIntentInfo>;
  /**
   * The PaymentIntent created for one of our invoices (search on metadata.invoiceKey), or null. Several: a
   * succeeded one first, then one still in flight, then the newest. Stripe search lags up to about a minute.
   */
  findPaymentIntentByInvoiceKey(invoiceKey: string): Promise<PaymentIntentInfo | null>;
}

/** Statuses of a PaymentIntent whose money may still arrive: never charge again while one exists. */
export const PI_IN_FLIGHT = ['processing', 'requires_action', 'requires_confirmation', 'requires_capture'];

/** The PaymentIntent that decides about a re-charge: succeeded first, then in flight, then the newest. */
export function pickPaymentIntent(intents: readonly PaymentIntentInfo[]): PaymentIntentInfo | null {
  if (intents.length === 0) return null;
  return intents.find(pi => pi.status === 'succeeded')
    ?? intents.find(pi => PI_IN_FLIGHT.includes(pi.status))
    ?? [...intents].sort((a, b) => b.created - a.created)[0];
}

const CURRENCY = 'chf';

export function stripePort(): StripePort {
  const stripe = new Stripe(stripeSecretKey.value());

  return {
    async ensureCustomer({ tenantId, name, email, existingId }) {
      const withEmail = email ? { email } : {};
      if (existingId) {
        await stripe.customers.update(existingId, { name, ...withEmail });
        return existingId;
      }
      const customer = await stripe.customers.create({ name, ...withEmail, metadata: { tenantId } });
      return customer.id;
    },

    async createSetupSession({ customerId, tenantId, successUrl, cancelUrl }) {
      const session = await stripe.checkout.sessions.create({
        mode: 'setup',
        customer: customerId,
        currency: CURRENCY,
        allowed_payment_method_types: ['card', 'paypal'],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { tenantId },
        setup_intent_data: { metadata: { tenantId } },
      });
      return { id: session.id, url: urlOf(session) };
    },

    async createPaymentSession({ customerId, amount, description, metadata, successUrl, cancelUrl, offerSave }) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer: customerId,
        allowed_payment_method_types: ['card', 'twint', 'paypal'],
        line_items: [{ quantity: 1, price_data: { currency: CURRENCY, unit_amount: amount, product_data: { name: description } } }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata,
        // Metadata also lives on the PaymentIntent so the payment_intent.* webhook carries it.
        payment_intent_data: { description, metadata },
        // Save only card/paypal: the app's SavedPaymentMethod models just those two. TWINT can be saved
        // since 2026-05 but we deliberately keep it one-off, so it is not given setup_future_usage.
        ...(offerSave
          ? {
              payment_method_options: {
                card: { setup_future_usage: 'off_session' as const },
                paypal: { setup_future_usage: 'off_session' as const },
              },
            }
          : {}),
      });
      return { id: session.id, url: urlOf(session) };
    },

    async chargeOffSession({ customerId, paymentMethodId, amount, description, metadata, idempotencyKey }) {
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount,
            currency: CURRENCY,
            customer: customerId,
            payment_method: paymentMethodId,
            off_session: true,
            confirm: true,
            description,
            metadata,
          },
          { idempotencyKey },
        );
        return { id: pi.id, status: pi.status, chargeId: chargeIdOf(pi) };
      } catch (err) {
        // A declined / authentication-required card is an outcome, not a failure of the port.
        if (err instanceof Stripe.errors.StripeCardError && err.payment_intent) {
          return { id: err.payment_intent.id, status: err.payment_intent.status, chargeId: chargeIdOf(err.payment_intent) };
        }
        throw err;
      }
    },

    async paymentMethodDisplay(paymentMethodId) {
      const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
      const isPaypal = pm.type === 'paypal';
      return {
        type: isPaypal ? 'paypal' : 'card',
        brand: isPaypal ? 'paypal' : (pm.card?.brand ?? ''),
        last4: pm.card?.last4 ?? '',
        expMonth: pm.card?.exp_month ?? 0,
        expYear: pm.card?.exp_year ?? 0,
        email: pm.paypal?.payer_email ?? '',
        stripePaymentMethodId: pm.id,
        consentAt: '',
      };
    },

    async setupIntentPaymentMethod(setupIntentId) {
      const si = await stripe.setupIntents.retrieve(setupIntentId);
      const pm = si.payment_method;
      const id = typeof pm === 'string' ? pm : (pm?.id ?? '');
      if (!id) throw new Error(`Stripe setup intent ${setupIntentId} has no payment method`);
      return id;
    },

    async feeOfCharge(chargeId) {
      const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
      const bt = charge.balance_transaction;
      if (!bt || typeof bt === 'string') throw new Error(`Stripe charge ${chargeId} has no expanded balance transaction`);
      if (bt.currency !== CURRENCY) throw new Error(`Stripe charge ${chargeId} fee is in ${bt.currency}, not ${CURRENCY}`);
      return bt.fee;
    },

    async detachPaymentMethod(paymentMethodId) {
      await stripe.paymentMethods.detach(paymentMethodId);
    },

    async retrievePaymentIntent(id) {
      return intentInfo(await stripe.paymentIntents.retrieve(id));
    },

    async findPaymentIntentByInvoiceKey(invoiceKey) {
      const quoted = invoiceKey.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const result = await stripe.paymentIntents.search({ query: `metadata['invoiceKey']:'${quoted}'`, limit: 20 });
      return pickPaymentIntent(result.data.map(intentInfo));
    },

    async expireSession(sessionId) {
      try {
        await stripe.checkout.sessions.expire(sessionId);
      } catch (err) {
        // Already expired or completed: nothing left to close.
        if (err instanceof Stripe.errors.StripeInvalidRequestError) return;
        throw err;
      }
    },
  };
}

function urlOf(session: Stripe.Checkout.Session): string {
  if (!session.url) throw new Error(`Stripe checkout session ${session.id} has no url`);
  return session.url;
}

function intentInfo(pi: Stripe.PaymentIntent): PaymentIntentInfo {
  return { id: pi.id, status: pi.status, amountReceived: pi.amount_received, chargeId: chargeIdOf(pi), created: pi.created, currency: pi.currency };
}

function chargeIdOf(pi: Stripe.PaymentIntent): string {
  const latest = pi.latest_charge;
  if (!latest) return '';
  return typeof latest === 'string' ? latest : latest.id;
}
