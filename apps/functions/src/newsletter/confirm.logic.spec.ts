import { NewsletterSignupDoc } from './types';
import { confirmOutcome } from './confirm.logic';

const NOW = new Date('2026-11-21T10:00:00Z'); // 2026-11-21 11:00:00 Zurich

function signup(over: Partial<NewsletterSignupDoc> = {}): NewsletterSignupDoc {
  return {
    tenants: ['scs'], groupKey: 'g1', formKey: 'f1', firstName: 'Anna', lastName: 'Muster', email: 'anna@example.com',
    city: '', createdAt: '20261120100000', expiresAt: '20261127100000', state: 'pending', ...over,
  };
}

describe('confirmOutcome', () => {
  it('confirms a pending, unexpired sign-up with a good signature and live group', () => {
    expect(confirmOutcome(signup(), true, true, NOW)).toBe('confirm');
  });
  it('is invalid on a bad signature', () => {
    expect(confirmOutcome(signup(), false, true, NOW)).toBe('invalid');
  });
  it('is invalid when the sign-up is missing', () => {
    expect(confirmOutcome(undefined, true, true, NOW)).toBe('invalid');
  });
  it('is expired once expiresAt has passed', () => {
    expect(confirmOutcome(signup({ expiresAt: '20261121105959' }), true, true, NOW)).toBe('expired');
  });
  it('is still valid exactly at expiresAt', () => {
    expect(confirmOutcome(signup({ expiresAt: '20261121110000' }), true, true, NOW)).toBe('confirm');
  });
  it('is alreadyConfirmed for a confirmed sign-up', () => {
    expect(confirmOutcome(signup({ state: 'confirmed' }), true, true, NOW)).toBe('alreadyConfirmed');
  });
  it('is alreadyConfirmed even when expired', () => {
    expect(confirmOutcome(signup({ state: 'confirmed', expiresAt: '20250101000000' }), true, true, NOW)).toBe('alreadyConfirmed');
  });
  it('is invalid when the group check fails', () => {
    expect(confirmOutcome(signup(), true, false, NOW)).toBe('invalid');
  });
  it('is invalid for any state other than pending or confirmed', () => {
    expect(confirmOutcome(signup({ state: 'weird' as unknown as 'pending' }), true, true, NOW)).toBe('invalid');
    expect(confirmOutcome(signup({ state: undefined as unknown as 'pending' }), true, true, NOW)).toBe('invalid');
  });
});
