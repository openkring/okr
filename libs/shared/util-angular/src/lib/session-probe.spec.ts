import { afterEach, describe, expect, it, vi } from 'vitest';

import { classifyStoredSession, probeStoredSession, storedSessionKey } from './session-probe';

const NOW = 1_700_000_000_000;

const blob = (expirationTime: unknown): string =>
  JSON.stringify({ uid: 'u1', stsTokenManager: { expirationTime } });

describe('classifyStoredSession', () => {
  it('reports nothing persisted — the restore is waiting on the IndexedDB fallback', () => {
    expect(classifyStoredSession(null, NOW)).toBe('none');
    expect(classifyStoredSession(undefined, NOW)).toBe('none');
    expect(classifyStoredSession('', NOW)).toBe('none');
  });

  it('reports an unexpired token as fresh — nothing to fetch before the first emit', () => {
    expect(classifyStoredSession(blob(NOW + 60_000), NOW)).toBe('fresh');
  });

  it('reports an expired token — the SDK must round-trip the token endpoint first', () => {
    expect(classifyStoredSession(blob(NOW - 1), NOW)).toBe('expired');
  });

  it('counts an expiry exactly now as expired — the refresh still has to happen', () => {
    expect(classifyStoredSession(blob(NOW), NOW)).toBe('expired');
  });

  it('never guesses fresh for a blob it cannot read an expiry out of', () => {
    expect(classifyStoredSession('{not json', NOW)).toBe('unreadable');
    expect(classifyStoredSession('null', NOW)).toBe('unreadable');
    expect(classifyStoredSession(JSON.stringify({ uid: 'u1' }), NOW)).toBe('unreadable');
    expect(classifyStoredSession(blob('soon'), NOW)).toBe('unreadable');
    expect(classifyStoredSession(blob(Number.NaN), NOW)).toBe('unreadable');
  });
});

describe('probeStoredSession', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('classifies what Firebase Auth persisted under the default app', () => {
    localStorage.setItem(storedSessionKey('KEY-1'), blob(NOW + 60_000));
    expect(probeStoredSession('KEY-1', NOW)).toBe('fresh');
  });

  it('reports none for a different project key rather than someone else’s session', () => {
    localStorage.setItem(storedSessionKey('KEY-1'), blob(NOW + 60_000));
    expect(probeStoredSession('KEY-2', NOW)).toBe('none');
  });

  it('survives a localStorage that throws — Safari private mode is a result, not a crash', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(probeStoredSession('KEY-1', NOW)).toBe('unreadable');
  });
});
