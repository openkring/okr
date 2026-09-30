import { describe, expect, it } from 'vitest';
import { afterFailure, decideLoginIdentity, decideOwnAccount, isLocked, LOCK_MS, LoginIdentity, MAX_FAILURES, mapSignInError } from './login-id.decide';

describe('decideLoginIdentity', () => {
  it('no Auth identity for the email → create one with the real email', () => {
    expect(decideLoginIdentity(undefined, undefined, 'p1')).toBe('createReal');
  });
  it('orphaned Auth identity (account closed, users doc deleted) → reuse it, as today', () => {
    expect(decideLoginIdentity('uid1', undefined, 'p1')).toBe('reuse');
  });
  it("this person's own account → exists", () => {
    expect(decideLoginIdentity('uid1', 'p1', 'p1')).toBe('exists');
  });
  it("another person's account → synthetic Benutzername account", () => {
    expect(decideLoginIdentity('uid1', 'p2', 'p1')).toBe('synthetic');
  });
  it('a holder doc without personKey is treated as another person, never as this one', () => {
    expect(decideLoginIdentity('uid1', '', 'p1')).toBe('synthetic');
  });

  describe('orphaned identity and its okrPersonKey claim', () => {
    it('no claim (legacy identity) → reuse, as today', () => {
      expect(decideLoginIdentity('uid1', undefined, 'p1', undefined)).toBe('reuse');
    });
    it('an empty claim counts as no claim → reuse', () => {
      expect(decideLoginIdentity('uid1', undefined, 'p1', '')).toBe('reuse');
    });
    it("this person's claim → reuse (a returning member gets their old login back)", () => {
      expect(decideLoginIdentity('uid1', undefined, 'p1', 'p1')).toBe('reuse');
    });
    it("another person's claim → synthetic, never hand their login to someone else", () => {
      expect(decideLoginIdentity('uid1', undefined, 'p1', 'p2')).toBe('synthetic');
    });
    it('the claim does not override a live holder doc', () => {
      expect(decideLoginIdentity('uid1', 'p1', 'p1', 'p2')).toBe('exists');
      expect(decideLoginIdentity('uid1', 'p2', 'p1', 'p1')).toBe('synthetic');
    });
  });
});

describe('decideOwnAccount', () => {
  const opening: LoginIdentity[] = ['createReal', 'reuse', 'synthetic'];

  it.each(opening)('%s with no own users doc in the tenant → proceed', (identity) => {
    expect(decideOwnAccount(identity, undefined)).toBe('proceed');
  });

  it.each(opening)('%s when the person already has a complete account → exists, never a second one', (identity) => {
    expect(decideOwnAccount(identity, { loginEmail: 'max_mueller@login.seeclub.org' })).toBe('exists');
  });

  it.each(opening)('%s when the own account is a half-open synthetic one (empty loginEmail) → resume', (identity) => {
    expect(decideOwnAccount(identity, { loginEmail: '' })).toBe('resume');
    expect(decideOwnAccount(identity, { loginEmail: '  ' })).toBe('resume');
    expect(decideOwnAccount(identity, {})).toBe('resume');
  });

  it("'exists' is decided by the email holder already — the guard stays out of it", () => {
    expect(decideOwnAccount('exists', { loginEmail: '' })).toBe('proceed');
    expect(decideOwnAccount('exists', undefined)).toBe('proceed');
  });
});

describe('login throttle', () => {
  it('locks after MAX_FAILURES failures for LOCK_MS', () => {
    let s = { failures: 0, lockedUntil: 0 };
    for (let i = 0; i < MAX_FAILURES; i++) s = afterFailure(s, 1000);
    expect(isLocked(s, 1000)).toBe(true);
    expect(isLocked(s, 1000 + LOCK_MS + 1)).toBe(false);
  });
  it('starts counting afresh once a lock has expired', () => {
    const locked = { failures: 0, lockedUntil: 5000 };
    expect(afterFailure(locked, 6000)).toEqual({ failures: 1, lockedUntil: 0 });
  });
  it('a failure during an active lock keeps it locked', () => {
    // fix round 2 #1: a burst of parallel wrong guesses that all read the same still-locked state
    // must not each reset it to { failures: 1, lockedUntil: 0 } — that would permanently unlock.
    const locked = { failures: 0, lockedUntil: 5000 };
    expect(afterFailure(locked, 1000)).toEqual(locked);
  });
  it('treats a missing state as clean', () => {
    expect(isLocked(undefined, 0)).toBe(false);
    expect(afterFailure(undefined, 0)).toEqual({ failures: 1, lockedUntil: 0 });
  });
});

describe('mapSignInError', () => {
  it('collapses wrong password, unknown and disabled into one answer', () => {
    expect(mapSignInError('INVALID_LOGIN_CREDENTIALS')).toBe('invalid');
    expect(mapSignInError('INVALID_PASSWORD')).toBe('invalid');
    expect(mapSignInError('EMAIL_NOT_FOUND')).toBe('invalid');
    expect(mapSignInError('USER_DISABLED')).toBe('invalid');
  });
  it('reports throttling separately', () => {
    expect(mapSignInError('TOO_MANY_ATTEMPTS_TRY_LATER : Too many unsuccessful login attempts.')).toBe('throttled');
  });
  it('anything else is an error, not a wrong password', () => {
    expect(mapSignInError('API_KEY_HTTP_REFERRER_BLOCKED')).toBe('error');
  });
});
