import { describe, expect, it } from 'vitest';

import { authPhase, isDegradedBoot, openBootGate, type BootState } from './boot-readiness.util';

const base: BootState = {
  phase: 'signedOut',
  hasCurrentUser: false,
  categoriesLoading: false,
  readinessTimedOut: false,
  authRestoreTimedOut: false,
};

describe('authPhase', () => {
  // The whole bug turned on undefined and null NOT being the same thing.
  it('separates "not known yet" from "signed out"', () => {
    expect(authPhase(undefined)).toBe('restoring');
    expect(authPhase(null)).toBe('signedOut');
    expect(authPhase({ uid: 'u1' })).toBe('signedIn');
  });
});

describe('openBootGate', () => {
  it('names the auth restore while it is still running', () => {
    expect(openBootGate({ ...base, phase: 'restoring' })).toBe('auth-restore');
  });

  it('names the user-doc read for a signed-in user without a UserModel', () => {
    expect(openBootGate({ ...base, phase: 'signedIn' })).toBe('user-doc');
  });

  it('names the categories read once the UserModel is there', () => {
    expect(openBootGate({ ...base, phase: 'signedIn', hasCurrentUser: true, categoriesLoading: true }))
      .toBe('categories');
  });

  it('reports auth-restore ahead of everything else — it is the outermost gate', () => {
    expect(openBootGate({ ...base, phase: 'restoring', categoriesLoading: true })).toBe('auth-restore');
  });

  it('falls back to unknown when no gate explains the stall', () => {
    expect(openBootGate({ ...base, phase: 'signedIn', hasCurrentUser: true })).toBe('unknown');
  });
});

describe('isDegradedBoot', () => {
  it('is false while everything is merely still loading', () => {
    expect(isDegradedBoot({ ...base, phase: 'restoring' })).toBe(false);
    expect(isDegradedBoot({ ...base, phase: 'signedIn' })).toBe(false);
  });

  /**
   * The regression this file exists for. Before the auth-restore watchdog, a boot stuck in
   * 'restoring' showed a spinner with no upper bound and no way out but a manual reload.
   */
  it('offers the way out once the auth-restore watchdog has fired', () => {
    expect(isDegradedBoot({ ...base, phase: 'restoring', authRestoreTimedOut: true })).toBe(true);
  });

  it('drops the panel again when auth finally settles', () => {
    expect(isDegradedBoot({ ...base, phase: 'signedOut', authRestoreTimedOut: true })).toBe(false);
    expect(isDegradedBoot({ ...base, phase: 'signedIn', hasCurrentUser: true, authRestoreTimedOut: true }))
      .toBe(false);
  });

  it('still covers the stalled user-doc read', () => {
    expect(isDegradedBoot({ ...base, phase: 'signedIn', readinessTimedOut: true })).toBe(true);
  });

  it('stays quiet for a settled-but-empty session, which is a broken account and not a slow network', () => {
    // No watchdog fired: the read came back fast, it just yielded nothing.
    expect(isDegradedBoot({ ...base, phase: 'signedIn' })).toBe(false);
  });

  it('drops the panel again when the UserModel finally arrives', () => {
    expect(isDegradedBoot({ ...base, phase: 'signedIn', hasCurrentUser: true, readinessTimedOut: true }))
      .toBe(false);
  });
});
