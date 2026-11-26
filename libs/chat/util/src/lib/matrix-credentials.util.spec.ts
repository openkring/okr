import { describe, expect, it } from 'vitest';
import { storedCredentialsAction } from './matrix-credentials.util';

describe('storedCredentialsAction', () => {
  const me = '@p1:chat.example';

  it('reuses usable credentials of the expected user', () =>
    expect(storedCredentialsAction(me, me, true)).toBe('reuse'));

  it('renews an expiring token of the same user and keeps the sync cache', () =>
    expect(storedCredentialsAction(me, me, false)).toBe('renew'));

  it('a different Matrix user also drops the sync cache (two persons in the portal, spec 1.179)', () =>
    expect(storedCredentialsAction('@p2:chat.example', me, true)).toBe('reset'));

  it('nothing stored: fetch new credentials, nothing to drop', () =>
    expect(storedCredentialsAction(undefined, me, false)).toBe('renew'));
});
