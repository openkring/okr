import { describe, expect, it } from 'vitest';

import { TRAINER_BILLING_I18N_KEYS, TRAINER_BILLING_REFUSALS, trainerBillingRefusal, trainerBillingRefusalKey } from './trainer-billing-i18n';

describe('trainerBillingRefusalKey', () => {
  it('has a message for every refusal reason', () => {
    for (const reason of TRAINER_BILLING_REFUSALS) {
      const key = trainerBillingRefusalKey({ details: { reason } });
      expect(key).not.toBe('send_refusal_unknown');
      expect(TRAINER_BILLING_I18N_KEYS[key]).toBe(`@finance/trainer-billing/util.send.refusal.${reason}`);
    }
  });

  it('falls back to a generic message for an unknown or missing reason', () => {
    expect(trainerBillingRefusalKey({ details: { reason: 'something-else' } })).toBe('send_refusal_unknown');
    expect(trainerBillingRefusalKey(new Error('offline'))).toBe('send_refusal_unknown');
    expect(trainerBillingRefusalKey(undefined)).toBe('send_refusal_unknown');
  });

  it('reads the reason of a callable error', () => {
    expect(trainerBillingRefusal({ code: 'functions/failed-precondition', details: { reason: 'no-iban' } })).toBe('no-iban');
    expect(trainerBillingRefusal({})).toBe('');
  });
});
