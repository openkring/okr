import { describe, expect, it } from 'vitest';

import { isRetryablePwdResetFailure, toPwdResetFailure } from './pwd-reset-result';

describe('toPwdResetFailure', () => {
  it('maps the Firebase action-code errors', () => {
    expect(toPwdResetFailure({ code: 'auth/expired-action-code' })).toBe('expired');
    expect(toPwdResetFailure({ code: 'auth/invalid-action-code' })).toBe('used');
  });

  it('maps missing and disabled accounts onto noAccount', () => {
    expect(toPwdResetFailure({ code: 'auth/user-not-found' })).toBe('noAccount');
    expect(toPwdResetFailure({ code: 'auth/user-disabled' })).toBe('noAccount');
  });

  it('maps the retryable errors', () => {
    expect(toPwdResetFailure({ code: 'auth/weak-password' })).toBe('weakPassword');
    expect(toPwdResetFailure({ code: 'auth/network-request-failed' })).toBe('network');
  });

  it('falls back to unknown for anything it does not recognise', () => {
    expect(toPwdResetFailure({ code: 'auth/internal-error' })).toBe('unknown');
    expect(toPwdResetFailure(new Error('boom'))).toBe('unknown');
    expect(toPwdResetFailure({ status: 504, message: 'Gateway Timeout' })).toBe('unknown');
    expect(toPwdResetFailure(undefined)).toBe('unknown');
    expect(toPwdResetFailure(null)).toBe('unknown');
    expect(toPwdResetFailure('auth/expired-action-code')).toBe('unknown');
  });
});

describe('isRetryablePwdResetFailure', () => {
  it('keeps the form open only for failures the user can fix right away', () => {
    expect(isRetryablePwdResetFailure('weakPassword')).toBe(true);
    expect(isRetryablePwdResetFailure('network')).toBe(true);
    expect(isRetryablePwdResetFailure('expired')).toBe(false);
    expect(isRetryablePwdResetFailure('used')).toBe(false);
    expect(isRetryablePwdResetFailure('noAccount')).toBe(false);
    expect(isRetryablePwdResetFailure('unknown')).toBe(false);
  });
});
