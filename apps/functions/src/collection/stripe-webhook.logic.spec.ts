import { describe, expect, it } from 'vitest';
import { feeBookingLines, isSettledRefusal, reduceStripeEvent, stripeActionOf, stripePaymentId } from './stripe-webhook.logic';

// 2026-11-09 10:00:00 UTC = 11:00 in Zurich; 2026-11-09 23:30:00 UTC = 00:30 on the 10th in Zurich.
const T_DAY = Date.UTC(2026, 10, 9, 10, 0, 0) / 1000;
const T_LATE = Date.UTC(2026, 10, 9, 23, 30, 0) / 1000;

const meta = { attemptKey: 'att1', tenantId: 'scs', accountingTenantId: 'bkg', purpose: 'invoice', invoiceKey: 'inv1' };

const ev = (type: string, object: Record<string, unknown>, created = T_DAY) => ({ id: 'evt_1', type, created, data: { object } });

describe('stripeActionOf', () => {
  it('a completed setup session → method-saved with the tenant and the setup intent', () => {
    const a = stripeActionOf(ev('checkout.session.completed', { mode: 'setup', setup_intent: 'seti_1', customer: 'cus_1', metadata: { tenantId: 'scs' } }));
    expect(a).toEqual({ kind: 'method-saved', tenantId: 'scs', paymentMethodId: '', setupIntentId: 'seti_1', customerId: 'cus_1' });
  });

  it('a completed setup session with an expanded setup intent carries its payment method', () => {
    const a = stripeActionOf(ev('checkout.session.completed', {
      mode: 'setup', setup_intent: { id: 'seti_1', payment_method: 'pm_1' }, metadata: { tenantId: 'scs' },
    }));
    expect(a).toEqual({ kind: 'method-saved', tenantId: 'scs', paymentMethodId: 'pm_1', setupIntentId: 'seti_1', customerId: '' });
  });

  it('a completed setup session without a tenant is ignored', () => {
    expect(stripeActionOf(ev('checkout.session.completed', { mode: 'setup', setup_intent: 'seti_1', metadata: {} })).kind).toBe('ignore');
  });

  it('a completed payment session is ignored (payment_intent.succeeded records it)', () => {
    expect(stripeActionOf(ev('checkout.session.completed', { mode: 'payment', metadata: meta })).kind).toBe('ignore');
  });

  it('payment_intent.succeeded → payment-succeeded with the Zurich day of the charge', () => {
    const a = stripeActionOf(ev('payment_intent.succeeded', {
      id: 'pi_3AbC_123', amount: 5000, amount_received: 5000, currency: 'chf', latest_charge: 'ch_1', payment_method: 'pm_1', customer: 'cus_1', metadata: meta,
    }, T_LATE));
    expect(a).toEqual({
      kind: 'payment-succeeded', attemptKey: 'att1', paymentIntentId: 'pi_3AbC_123', chargeId: 'ch_1', amount: 5000, date: '20261110',
      currency: 'chf', paymentMethodId: 'pm_1', customerId: 'cus_1',
    });
  });

  it('payment_intent.succeeded prefers the created time of an expanded charge', () => {
    const a = stripeActionOf(ev('payment_intent.succeeded', {
      id: 'pi_1', amount: 5000, amount_received: 5000, latest_charge: { id: 'ch_1', created: T_DAY }, metadata: meta,
    }, T_LATE));
    expect(a).toMatchObject({ kind: 'payment-succeeded', chargeId: 'ch_1', date: '20261109' });
  });

  it('payment_intent.succeeded without metadata.attemptKey is ignored', () => {
    const a = stripeActionOf(ev('payment_intent.succeeded', { id: 'pi_1', amount: 5000, latest_charge: 'ch_1', metadata: { tenantId: 'scs' } }));
    expect(a.kind).toBe('ignore');
  });

  it('payment_intent.payment_failed → payment-failed with the decline message', () => {
    const a = stripeActionOf(ev('payment_intent.payment_failed', {
      id: 'pi_1', metadata: meta, last_payment_error: { code: 'card_declined', message: 'Your card was declined.' },
    }));
    expect(a).toEqual({ kind: 'payment-failed', attemptKey: 'att1', paymentIntentId: 'pi_1', error: 'Your card was declined.' });
  });

  it('payment_intent.payment_failed without metadata.attemptKey is ignored', () => {
    expect(stripeActionOf(ev('payment_intent.payment_failed', { id: 'pi_1', metadata: {} })).kind).toBe('ignore');
  });

  it('checkout.session.expired → ignore, naming the attempt to expire', () => {
    const a = stripeActionOf(ev('checkout.session.expired', { mode: 'payment', metadata: meta }));
    expect(a).toEqual({ kind: 'ignore', reason: 'checkout session expired', expireAttemptKey: 'att1' });
  });

  it('an expired setup session has no attempt to expire', () => {
    const a = stripeActionOf(ev('checkout.session.expired', { mode: 'setup', metadata: { tenantId: 'scs' } }));
    expect(a.kind).toBe('ignore');
    expect(a).not.toHaveProperty('expireAttemptKey');
  });

  it('an unknown event type is ignored', () => {
    expect(stripeActionOf(ev('customer.updated', { id: 'cus_1' }))).toEqual({ kind: 'ignore', reason: 'event type customer.updated' });
  });

  it('a malformed event is ignored, never throws', () => {
    expect(stripeActionOf(null).kind).toBe('ignore');
    expect(stripeActionOf({ type: 'payment_intent.succeeded' }).kind).toBe('ignore');
  });
});

describe('stripePaymentId', () => {
  it('prefixes stripe, keeps letters and digits only and cuts to 32', () => {
    expect(stripePaymentId('pi_3AbC_123')).toBe('stripepi3AbC123');
    const long = stripePaymentId('pi_3QWERTYUIOPASDFGHJKLZXCVBNM1234567890');
    expect(long).toHaveLength(32);
    expect(long).toMatch(/^[A-Za-z0-9]{8,32}$/);
  });
});

describe('isSettledRefusal', () => {
  it('overpayment and not-payable mean the invoice cannot take the money', () => {
    expect(isSettledRefusal(['overpayment'])).toBe(true);
    expect(isSettledRefusal(['not-payable', 'overpayment'])).toBe(true);
    expect(isSettledRefusal(['no-payment-date'])).toBe(false);
    expect(isSettledRefusal(undefined)).toBe(false);
  });
});

describe('feeBookingLines', () => {
  it('debits the fee account and credits the clearing account', () => {
    expect(feeBookingLines('acc-fee', 'acc-clr', 145)).toEqual([
      { accountKey: 'acc-fee', debitAmount: { amount: 145, currency: 'CHF' } },
      { accountKey: 'acc-clr', creditAmount: { amount: 145, currency: 'CHF' } },
    ]);
  });
});

describe('reduceStripeEvent', () => {
  const fullPi = {
    id: 'evt_9', type: 'payment_intent.succeeded', created: T_LATE, livemode: false, api_version: '2026-01-01',
    data: {
      object: {
        id: 'pi_1', object: 'payment_intent', status: 'succeeded', amount: 5000, amount_received: 5000, currency: 'chf',
        customer: { id: 'cus_1', email: 'x@example.ch' }, payment_method: 'pm_1', latest_charge: { id: 'ch_1', created: T_DAY, billing_details: { name: 'A' } },
        metadata: meta, last_payment_error: { message: 'm', payment_method: { billing_details: { email: 'x@example.ch' } } },
        customer_details: { email: 'x@example.ch', name: 'Anna' }, shipping: { name: 'Anna' }, charges: { data: [{ id: 'ch_1' }] },
        payment_method_types: ['card'],
      },
    },
  };

  it('keeps only id, type, created and the fields the logic reads', () => {
    expect(reduceStripeEvent(fullPi)).toEqual({
      id: 'evt_9', type: 'payment_intent.succeeded', created: T_LATE,
      data: {
        object: {
          id: 'pi_1', object: 'payment_intent', status: 'succeeded', amount: 5000, amount_received: 5000, currency: 'chf',
          customer: 'cus_1', payment_method: 'pm_1', latest_charge: { id: 'ch_1', created: T_DAY }, metadata: meta, last_payment_error: { message: 'm' },
        },
      },
    });
  });

  it('stripeActionOf reads the reduced shape the same as the full event', () => {
    expect(stripeActionOf(reduceStripeEvent(fullPi))).toEqual(stripeActionOf(fullPi));
    const setup = ev('checkout.session.completed', {
      mode: 'setup', setup_intent: { id: 'seti_1', payment_method: { id: 'pm_1', card: { last4: '4242' } } }, customer: 'cus_1',
      metadata: { tenantId: 'scs' }, customer_details: { email: 'x@example.ch' },
    });
    expect(stripeActionOf(reduceStripeEvent(setup))).toEqual(stripeActionOf(setup));
    const expired = ev('checkout.session.expired', { mode: 'payment', metadata: meta, payment_intent: 'pi_1' });
    expect(stripeActionOf(reduceStripeEvent(expired))).toEqual(stripeActionOf(expired));
  });

  it('throws on a non-object body (the receiver answers 400)', () => {
    expect(() => reduceStripeEvent([1])).toThrow();
  });
});
