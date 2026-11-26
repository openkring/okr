import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  classifyStoredSession,
  classifyStoredUser,
  dropExpiredSessionIdb,
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
  const deleted: string[] = [];
  const request = <T>(result: T) => {
    const req: { result: T; error: null; onsuccess?: () => void; onerror?: () => void } = { result, error: null };
    queueMicrotask(() => req.onsuccess?.());
    return req;
  };
  const open = vi.fn(() => request({
    objectStoreNames: { contains: (n: string) => (opts.stores ?? []).includes(n) },
    transaction: () => ({ objectStore: () => ({
      get: (k: string) => request(opts.rows?.[k]),
      delete: (k: string) => { deleted.push(k); return request(undefined); },
    }) }),
    close: vi.fn(),
    onversionchange: null,
  }));
  const factory: Record<string, unknown> = { open };
  if (!opts.noDatabases) factory['databases'] = async () => (opts.databases ?? []).map(name => ({ name, version: 1 }));
  vi.stubGlobal('indexedDB', factory);
  return { open, deleted };
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

describe('dropExpiredSessionIdb', () => {
  afterEach(() => vi.unstubAllGlobals());

  const STORE = 'firebaseLocalStorage';
  const KEY = storedSessionKey('KEY-1');
  const row = (expirationTime: number) => ({ [KEY]: { fbase_key: KEY, value: { stsTokenManager: { expirationTime } } } });

  it('removes an expired session so the retry boot reaches the login page (SCS-AZ)', async () => {
    const { deleted } = stubIndexedDb({ databases: [FIREBASE_AUTH_IDB_NAME], stores: [STORE], rows: row(NOW - 1) });
    expect(await dropExpiredSessionIdb('KEY-1', () => NOW)).toBe(true);
    expect(deleted).toEqual([KEY]);
  });

  it('keeps a session that is valid again — a renewal that landed meanwhile is never thrown away', async () => {
    const { deleted } = stubIndexedDb({ databases: [FIREBASE_AUTH_IDB_NAME], stores: [STORE], rows: row(NOW + 60_000) });
    expect(await dropExpiredSessionIdb('KEY-1', () => NOW)).toBe(false);
    expect(deleted).toEqual([]);
  });

  it('keeps a row it cannot read an expiry out of', async () => {
    const { deleted } = stubIndexedDb({ databases: [FIREBASE_AUTH_IDB_NAME], stores: [STORE], rows: { [KEY]: { value: {} } } });
    expect(await dropExpiredSessionIdb('KEY-1', () => NOW)).toBe(false);
    expect(deleted).toEqual([]);
  });

  it('does nothing when there is no session for this project', async () => {
    const { deleted } = stubIndexedDb({ databases: [FIREBASE_AUTH_IDB_NAME], stores: [STORE], rows: row(NOW - 1) });
    expect(await dropExpiredSessionIdb('KEY-2', () => NOW)).toBe(false);
    expect(deleted).toEqual([]);
  });

  it('never opens — and so never creates — a database that does not exist', async () => {
    const { open } = stubIndexedDb({ databases: [] });
    expect(await dropExpiredSessionIdb('KEY-1', () => NOW)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('never throws where there is no IndexedDB at all', async () => {
    vi.stubGlobal('indexedDB', undefined);
    expect(await dropExpiredSessionIdb('KEY-1', () => NOW)).toBe(false);
  });
});
