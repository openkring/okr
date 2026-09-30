import { describe, expect, it } from 'vitest';
import { decideLoginIdentity } from './login-id.decide';

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
});
