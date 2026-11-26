import { describe, expect, it } from 'vitest';
import { storedCredentialsAction, syncStoreDecision } from './matrix-credentials.util';

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

describe('syncStoreDecision', () => {
  const me = '@p1:chat.example';

  it('keeps the cache of the same user', () => expect(syncStoreDecision(me, me)).toBe('keep'));

  it("drops another user's cache, whatever the stored credentials say", () =>
    expect(syncStoreDecision('@p2:chat.example', me)).toBe('reset'));

  it('adopts a cache without owner (an install from before the marker existed)', () =>
    expect(syncStoreDecision(null, me)).toBe('adopt'));
});
