import { describe, expect, it } from 'vitest';

import { toLoginFailure } from './login-result';

describe('toLoginFailure', () => {
  it('collapses the three credential errors into one reason', () => {
    expect(toLoginFailure({ code: 'auth/invalid-credential' })).toBe('wrongCredentials');
    expect(toLoginFailure({ code: 'auth/wrong-password' })).toBe('wrongCredentials');
    expect(toLoginFailure({ code: 'auth/user-not-found' })).toBe('wrongCredentials');
  });

  it('maps the reasons that need their own advice', () => {
    expect(toLoginFailure({ code: 'auth/invalid-email' })).toBe('invalidEmail');
    expect(toLoginFailure({ code: 'auth/user-disabled' })).toBe('disabled');
    expect(toLoginFailure({ code: 'auth/too-many-requests' })).toBe('tooManyAttempts');
    expect(toLoginFailure({ code: 'auth/network-request-failed' })).toBe('network');
  });

  it('falls back to unknown for anything it does not recognise', () => {
    expect(toLoginFailure({ code: 'auth/internal-error' })).toBe('unknown');
    expect(toLoginFailure(new Error('boom'))).toBe('unknown');
    expect(toLoginFailure({ status: 504, message: 'Gateway Timeout' })).toBe('unknown');
    expect(toLoginFailure(undefined)).toBe('unknown');
    expect(toLoginFailure(null)).toBe('unknown');
  });
});
