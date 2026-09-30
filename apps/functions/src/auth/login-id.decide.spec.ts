import { describe, expect, it } from 'vitest';
import { decideLoginIdentity, decideOwnAccount, LoginIdentity } from './login-id.decide';

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
