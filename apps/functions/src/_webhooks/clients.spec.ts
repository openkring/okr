import { describe, it, expect } from 'vitest';
import { WEBHOOK_CLIENTS, WEBHOOK_SECRETS, findClient } from './clients';

describe('WEBHOOK_CLIENTS', () => {
  it('declares every client completely, with a unique id', () => {
    const ids = WEBHOOK_CLIENTS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of WEBHOOK_CLIENTS) {
      expect(c.id).not.toBe('');
      expect(c.type).not.toBe('');
      expect(c.maxBodyBytes).toBeGreaterThan(0);
      // Stripe rows are payment evidence and stay 90 days; everything else 30.
      expect(c.retentionDays).toBe(c.id === 'stripe' ? 90 : 30);
    }
  });
  it('stripe is registered with its signing secret in WEBHOOK_SECRETS', () => {
    const stripe = findClient('stripe');
    expect(stripe?.auth.kind).toBe('stripe-signature');
    expect(WEBHOOK_SECRETS).toContain(stripe?.auth.secret);
  });
  it('findClient returns undefined for an unknown id', () => {
    expect(findClient('no-such-client')).toBeUndefined();
  });
});
