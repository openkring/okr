import { describe, expect, it } from 'vitest';
import { disputeLoss, feeBookingLines, isSettledRefusal, reduceStripeEvent, stripeActionOf, stripePaymentId, transferLines } from './stripe-webhook.logic';

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

describe('stripeActionOf: refunds, disputes, payouts', () => {
  const charge = { id: 'ch_1', object: 'charge', payment_intent: 'pi_1', amount: 5000, amount_refunded: 2000, currency: 'CHF', metadata: meta };
  const dispute = {
    id: 'dp_1', object: 'dispute', charge: 'ch_1', payment_intent: 'pi_1', amount: 5000, currency: 'chf', status: 'needs_response', reason: 'fraudulent',
    balance_transactions: [{ id: 'txn_1', amount: -5000, fee: 1500, currency: 'chf' }],
  };

  it('charge.refunded → charge-refunded with the charge, its PaymentIntent and the attempt from metadata', () => {
    expect(stripeActionOf(ev('charge.refunded', charge))).toEqual({
      kind: 'charge-refunded', chargeId: 'ch_1', paymentIntentId: 'pi_1', attemptKey: 'att1', amountRefunded: 2000, currency: 'chf',
    });
  });

  it('charge.refunded without metadata still names the charge (the handler finds the attempt by its ids)', () => {
    expect(stripeActionOf(ev('charge.refunded', { ...charge, metadata: {}, payment_intent: { id: 'pi_1' } }))).toMatchObject({
      kind: 'charge-refunded', attemptKey: '', paymentIntentId: 'pi_1',
    });
  });

  it('charge.refunded without a charge id is ignored', () => {
    expect(stripeActionOf(ev('charge.refunded', { ...charge, id: '' })).kind).toBe('ignore');
  });

  it('charge.dispute.created → dispute-opened', () => {
    expect(stripeActionOf(ev('charge.dispute.created', dispute))).toEqual({
      kind: 'dispute-opened', disputeId: 'dp_1', chargeId: 'ch_1', paymentIntentId: 'pi_1', attemptKey: '', amount: 5000, reason: 'fraudulent',
    });
  });

  it('charge.dispute.closed → dispute-closed with status, fee and the Zurich day', () => {
    expect(stripeActionOf(ev('charge.dispute.closed', { ...dispute, status: 'lost' }, T_LATE))).toEqual({
      kind: 'dispute-closed', disputeId: 'dp_1', chargeId: 'ch_1', paymentIntentId: 'pi_1', attemptKey: '', status: 'lost',
      amount: 5000, fee: 1500, currency: 'chf', feeCurrencies: ['chf'], date: '20261110',
    });
  });

  it('payout.paid is ignored: the bank import matches the payout', () => {
    expect(stripeActionOf(ev('payout.paid', { id: 'po_1', amount: 10000 }))).toEqual({ kind: 'ignore', reason: 'payout: matched by the bank import' });
  });
});

describe('disputeLoss', () => {
  it('is the disputed amount plus the fees of its balance transactions', () => {
    expect(disputeLoss(5000, 1500)).toBe(6500);
    expect(disputeLoss(5000, 0)).toBe(5000);
  });
});

describe('transferLines', () => {
  it('debits one account and credits the other with the same CHF amount', () => {
    expect(transferLines('acc-1090', 'acc-2030', 700)).toEqual([
      { accountKey: 'acc-1090', debitAmount: { amount: 700, currency: 'CHF' } },
      { accountKey: 'acc-2030', creditAmount: { amount: 700, currency: 'CHF' } },
    ]);
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

  it('keeps the charge, refund and dispute fields the logic reads, never card or billing details', () => {
    const chargeEvent = ev('charge.refunded', {
      id: 'ch_1', object: 'charge', payment_intent: 'pi_1', amount: 5000, amount_refunded: 2000, currency: 'chf', metadata: meta, status: 'succeeded',
      billing_details: { name: 'Anna', email: 'x@example.ch' }, payment_method_details: { card: { last4: '4242' } }, receipt_email: 'x@example.ch',
      refunds: { object: 'list', data: [{ id: 're_1' }] }, balance_transaction: 'txn_1',
    });
    expect(reduceStripeEvent(chargeEvent)['data']).toEqual({ object: {
      id: 'ch_1', object: 'charge', payment_intent: 'pi_1', amount: 5000, amount_refunded: 2000, currency: 'chf', metadata: meta, status: 'succeeded',
    } });
    expect(stripeActionOf(reduceStripeEvent(chargeEvent))).toEqual(stripeActionOf(chargeEvent));

    const refundEvent = ev('charge.refund.updated', {
      id: 're_1', object: 'refund', charge: { id: 'ch_1', billing_details: { name: 'Anna' } }, payment_intent: 'pi_1', amount: 2000, currency: 'chf',
      status: 'succeeded', destination_details: { card: { reference: 'x' } },
    });
    expect(reduceStripeEvent(refundEvent)['data']).toEqual({ object: {
      id: 're_1', object: 'refund', charge: 'ch_1', payment_intent: 'pi_1', amount: 2000, currency: 'chf', status: 'succeeded',
    } });

    const disputeEvent = ev('charge.dispute.closed', {
      id: 'dp_1', object: 'dispute', charge: 'ch_1', payment_intent: 'pi_1', amount: 5000, currency: 'chf', status: 'lost', reason: 'fraudulent',
      evidence: { billing_address: 'Seestrasse 1', customer_email_address: 'x@example.ch' },
      balance_transactions: [{ id: 'txn_1', amount: -5000, fee: 1500, currency: 'chf', source: 'dp_1', fee_details: [{ amount: 1500 }] }],
      payment_method_details: { card: { brand: 'visa' } },
    });
    expect(reduceStripeEvent(disputeEvent)['data']).toEqual({ object: {
      id: 'dp_1', object: 'dispute', charge: 'ch_1', payment_intent: 'pi_1', amount: 5000, currency: 'chf', status: 'lost', reason: 'fraudulent',
      balance_transactions: [{ fee: 1500, currency: 'chf' }],
    } });
    expect(stripeActionOf(reduceStripeEvent(disputeEvent))).toEqual(stripeActionOf(disputeEvent));
  });

  it('throws on a non-object body (the receiver answers 400)', () => {
    expect(() => reduceStripeEvent([1])).toThrow();
  });
});
