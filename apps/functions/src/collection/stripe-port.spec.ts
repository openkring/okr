import { describe, expect, it } from 'vitest';

import { pickPaymentIntent } from './stripe-port';
import type { PaymentIntentInfo } from './stripe-port';

const pi = (id: string, status: string, created: number): PaymentIntentInfo => ({ id, status, created, amountReceived: 0, chargeId: '', currency: 'chf' });

describe('pickPaymentIntent', () => {
  it('a succeeded one first, then one in flight, then the newest', () => {
    expect(pickPaymentIntent([])).toBeNull();
    expect(pickPaymentIntent([pi('a', 'canceled', 3), pi('b', 'succeeded', 1), pi('c', 'processing', 2)])?.id).toBe('b');
    expect(pickPaymentIntent([pi('a', 'canceled', 3), pi('c', 'requires_action', 2)])?.id).toBe('c');
    expect(pickPaymentIntent([pi('a', 'canceled', 1), pi('d', 'requires_payment_method', 5)])?.id).toBe('d');
  });
});
