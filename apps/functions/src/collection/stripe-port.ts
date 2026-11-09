import { defineSecret } from 'firebase-functions/params';
import Stripe from 'stripe';
import type { SavedPaymentMethod } from '@okr/shared-models';

export const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
export const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

/**
 * The only door to Stripe. Stripe is a pure payment processor behind our own invoice: no Stripe
 * Invoices, Subscriptions or Prices. Amounts are integer Rappen (= Stripe's CHF minor unit).
 */
export interface StripePort {
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
  feeOfCharge(chargeId: string): Promise<number /* Rappen */>;
  detachPaymentMethod(paymentMethodId: string): Promise<void>;
}

const CURRENCY = 'chf';

export function stripePort(): StripePort {
  const stripe = new Stripe(stripeSecretKey.value());

  return {
    async ensureCustomer({ tenantId, name, email, existingId }) {
      if (existingId) {
        await stripe.customers.update(existingId, { name, email });
        return existingId;
      }
      const customer = await stripe.customers.create({ name, email, metadata: { tenantId } });
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
      return { id: session.id, url: session.url ?? '' };
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
      return { id: session.id, url: session.url ?? '' };
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

    async feeOfCharge(chargeId) {
      const charge = await stripe.charges.retrieve(chargeId, { expand: ['balance_transaction'] });
      const bt = charge.balance_transaction;
      return bt && typeof bt !== 'string' ? bt.fee : 0;
    },

    async detachPaymentMethod(paymentMethodId) {
      await stripe.paymentMethods.detach(paymentMethodId);
    },
  };
}

function chargeIdOf(pi: Stripe.PaymentIntent): string {
  const latest = pi.latest_charge;
  if (!latest) return '';
  return typeof latest === 'string' ? latest : latest.id;
}
