import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  classifyStoredSession,
  classifyStoredUser,
  FIREBASE_AUTH_IDB_NAME,
  probeStoredSession,
  probeStoredSessionIdb,
  storedSessionKey,
} from './session-probe';

const NOW = 1_700_000_000_000;

const blob = (expirationTime: unknown): string =>
  JSON.stringify({ uid: 'u1', stsTokenManager: { expirationTime } });

describe('classifyStoredSession', () => {
  it('reports nothing persisted in localStorage', () => {
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

describe('classifyStoredUser', () => {
  it('classifies the object IndexedDB holds without a JSON round-trip', () => {
    expect(classifyStoredUser({ stsTokenManager: { expirationTime: NOW + 1 } }, NOW)).toBe('fresh');
    expect(classifyStoredUser({ stsTokenManager: { expirationTime: NOW } }, NOW)).toBe('expired');
    expect(classifyStoredUser(undefined, NOW)).toBe('unreadable');
  });
});

/**
 * Minimal IDBFactory stand-in: jsdom has no IndexedDB and fake-indexeddb is not a dependency.
 * Requests resolve on a microtask, like the real thing resolves asynchronously.
 */
function stubIndexedDb(opts: { databases?: string[]; stores?: string[]; rows?: Record<string, unknown>; noDatabases?: boolean }) {
  const request = <T>(result: T) => {
    const req: { result: T; error: null; onsuccess?: () => void; onerror?: () => void } = { result, error: null };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  const open = vi.fn(() => request({
    objectStoreNames: { contains: (n: string) => (opts.stores ?? []).includes(n) },
    transaction: () => ({ objectStore: () => ({ get: (k: string) => request(opts.rows?.[k]) }) }),
    close: vi.fn(),
    onversionchange: null,
  }));
  const factory: Record<string, unknown> = { open };
  if (!opts.noDatabases) factory['databases'] = async () => (opts.databases ?? []).map(name => ({ name, version: 1 }));
  vi.stubGlobal('indexedDB', factory);
  return { open };
}

describe('probeStoredSessionIdb', () => {
  afterEach(() => vi.unstubAllGlobals());

  const STORE = 'firebaseLocalStorage';
  const row = (expirationTime: number) => ({
    [storedSessionKey('KEY-1')]: { fbase_key: storedSessionKey('KEY-1'), value: { stsTokenManager: { expirationTime } } },
  });

  it('classifies the session Firebase Auth persisted in IndexedDB', async () => {
    stubIndexedDb({ databases: [FIREBASE_AUTH_IDB_NAME], stores: [STORE], rows: row(NOW - 1) });
    expect(await probeStoredSessionIdb('KEY-1', () => NOW)).toBe('expired');
  });

  it('reports none when the database holds no session for this project', async () => {
    stubIndexedDb({ databases: [FIREBASE_AUTH_IDB_NAME], stores: [STORE], rows: row(NOW + 1) });
    expect(await probeStoredSessionIdb('KEY-2', () => NOW)).toBe('none');
  });

  it('never opens — and so never creates — a database that does not exist yet', async () => {
    const { open } = stubIndexedDb({ databases: [] });
    expect(await probeStoredSessionIdb('KEY-1', () => NOW)).toBe('none');
    expect(open).not.toHaveBeenCalled();
  });

  it('reports unreadable instead of a blind open when databases() is missing', async () => {
    const { open } = stubIndexedDb({ noDatabases: true });
    expect(await probeStoredSessionIdb('KEY-1', () => NOW)).toBe('unreadable');
    expect(open).not.toHaveBeenCalled();
  });

  it('reports unreadable where there is no IndexedDB at all', async () => {
    vi.stubGlobal('indexedDB', undefined);
    expect(await probeStoredSessionIdb('KEY-1', () => NOW)).toBe('unreadable');
  });
});
