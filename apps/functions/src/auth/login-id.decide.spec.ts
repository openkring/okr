import { describe, expect, it } from 'vitest';
import {
  afterFailure, decideLoginIdentity, decideOwnAccount, decideSyntheticCandidate, isLocked, LOCK_MS, LoginIdentity, MAX_FAILURES,
  mapSignInError, needsPersonKeyStamp, PERSON_KEY_CLAIM, personKeyStampsDue,
} from './login-id.decide';

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

describe('decideSyntheticCandidate', () => {
  const orphan = (claimPersonKey?: string) => ({ uid: 'old', claimPersonKey, hasUserDoc: false });

  it('no Auth identity holds the address → free', () => {
    expect(decideSyntheticCandidate(undefined, 'p1')).toBe('free');
  });
  it("this person's own orphan (closed account, stamped for them) → reclaim: the old login comes back", () => {
    expect(decideSyntheticCandidate(orphan('p1'), 'p1')).toBe('reclaim');
  });
  it("somebody else's orphan → taken (a namesake moves on to the next candidate)", () => {
    expect(decideSyntheticCandidate(orphan('p2'), 'p1')).toBe('taken');
  });
  it('an unstamped orphan is never handed out → taken', () => {
    expect(decideSyntheticCandidate(orphan(undefined), 'p1')).toBe('taken');
    expect(decideSyntheticCandidate(orphan(''), 'p1')).toBe('taken');
  });
  it('a live account (users doc exists) → taken, even when stamped for this person', () => {
    expect(decideSyntheticCandidate({ uid: 'live', claimPersonKey: 'p1', hasUserDoc: true }, 'p1')).toBe('taken');
  });
  it('an empty personKey never reclaims', () => {
    expect(decideSyntheticCandidate(orphan(''), '')).toBe('taken');
  });
  it('the fixed uid holding the address itself is no collision → free', () => {
    expect(decideSyntheticCandidate({ uid: 'u1', hasUserDoc: true }, 'p1', 'u1')).toBe('free');
  });
  it('with a fixed uid, another identity still counts (reclaim is up to the caller)', () => {
    expect(decideSyntheticCandidate({ uid: 'u2', hasUserDoc: true }, 'p1', 'u1')).toBe('taken');
    expect(decideSyntheticCandidate(orphan('p1'), 'p1', 'u1')).toBe('reclaim');
  });
});

describe('okrPersonKey backfill selection', () => {
  it('needsPersonKeyStamp: only an identity without a stamp, and only with a personKey', () => {
    expect(needsPersonKeyStamp(undefined, 'p1')).toBe(true);
    expect(needsPersonKeyStamp({}, 'p1')).toBe(true);
    expect(needsPersonKeyStamp({ [PERSON_KEY_CLAIM]: '' }, 'p1')).toBe(true);
    expect(needsPersonKeyStamp({ [PERSON_KEY_CLAIM]: 'p1' }, 'p1')).toBe(false);
    expect(needsPersonKeyStamp({ [PERSON_KEY_CLAIM]: 'p2' }, 'p1')).toBe(false); // never overwritten
    expect(needsPersonKeyStamp(undefined, '')).toBe(false);
    expect(needsPersonKeyStamp(undefined, undefined)).toBe(false);
  });
  it('personKeyStampsDue: live docs with an unstamped Auth identity, other claims carried along', () => {
    const claims = new Map<string, Record<string, unknown> | undefined>([
      ['legacy', undefined],
      ['withOther', { admin: true }],
      ['stamped', { [PERSON_KEY_CLAIM]: 'p3' }],
      ['noPerson', undefined],
    ]);
    const due = personKeyStampsDue([
      { uid: 'legacy', personKey: 'p1' },
      { uid: 'withOther', personKey: 'p2' },
      { uid: 'stamped', personKey: 'p3' },
      { uid: 'noPerson', personKey: '' },
      { uid: 'halfOpen', personKey: 'p5' }, // users doc without an Auth identity
    ], claims);
    expect(due).toEqual([
      { uid: 'legacy', personKey: 'p1', claims: {} },
      { uid: 'withOther', personKey: 'p2', claims: { admin: true } },
    ]);
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
