import { describe, expect, it } from 'vitest';
import { MAX_TOPUP, MIN_TOPUP } from '@okr/business-metering-util';

import { autoTopUpValidations } from './auto-top-up.validations';

const ok = { enabled: true, threshold: 2000, amount: MIN_TOPUP };

describe('auto top-up form validations', () => {
  it('accepts a valid setting', () => expect(autoTopUpValidations(ok).hasErrors()).toBe(false));
  it('accepts a threshold of 0', () => expect(autoTopUpValidations({ ...ok, threshold: 0 }).hasErrors()).toBe(false));
  it('rejects an amount below the minimum top-up', () => {
    expect(autoTopUpValidations({ ...ok, amount: MIN_TOPUP - 1 }).hasErrors('amount')).toBe(true);
  });
  it('rejects an amount above the maximum top-up', () => {
    expect(autoTopUpValidations({ ...ok, amount: MAX_TOPUP + 1 }).hasErrors('amount')).toBe(true);
  });
  it('rejects a negative threshold', () => {
    expect(autoTopUpValidations({ ...ok, threshold: -1 }).hasErrors('threshold')).toBe(true);
  });
  it('switched off, an empty amount is fine (as on the server)', () => {
    expect(autoTopUpValidations({ enabled: false, threshold: 0, amount: 0 }).hasErrors()).toBe(false);
  });
  it('switched off, a set amount must still be a valid top-up', () => {
    expect(autoTopUpValidations({ enabled: false, threshold: 0, amount: 100 }).hasErrors('amount')).toBe(true);
  });
});
