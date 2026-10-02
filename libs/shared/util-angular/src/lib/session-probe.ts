/**
 * What the browser had stored for the signed-in session at boot.
 *
 * SCS-AZ showed a boot that sat in the `session-restore` gate for 12.7 s: App Check was healthy
 * after 0.8 s and then `onAuthStateChanged` simply never emitted. From the outside that has three
 * very different causes and the report could not tell them apart:
 *
 *  - nothing persisted in localStorage — the restore was waiting on the IndexedDB fallback, which
 *    is exactly what WebKit throttles under ITP;
 *  - a persisted session whose ID token had already expired — the SDK must round-trip the token
 *    endpoint before it emits, and that request has no client-side timeout;
 *  - a persisted, still-valid session — nothing to fetch, so a stall there is an SDK-internal hang.
 *
 * One mark decides which. Deliberately no network call and no SDK internals beyond the stored
 * blob's shape, so it cannot itself slow the boot it measures.
 */
export type StoredSessionState = 'none' | 'fresh' | 'expired' | 'unreadable';

/**
 * The localStorage key Firebase Auth persists the current user under. `[DEFAULT]` is the default
 * FirebaseApp name — the only one this app creates.
 */
export function storedSessionKey(apiKey: string): string {
  return `firebase:authUser:${apiKey}:[DEFAULT]`;
}

/**
 * Classify the persisted-session blob. Pure, so the interesting cases are testable.
 *
 * @param raw what localStorage held, or null/undefined when it held nothing
 * @param nowMs current wall clock, in ms
 */
export function classifyStoredSession(raw: string | null | undefined, nowMs: number): StoredSessionState {
  if (!raw) return 'none';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 'unreadable';
  }
  return classifyStoredUser(parsed, nowMs);
}

/**
 * Classify an already-parsed persisted user — the shape both stores hold (localStorage as a JSON
 * string, IndexedDB as the object itself).
 */
export function classifyStoredUser(parsed: unknown, nowMs: number): StoredSessionState {
  const expiresAt = (parsed as { stsTokenManager?: { expirationTime?: unknown } })?.stsTokenManager?.expirationTime;
  // A blob we cannot read an expiry out of tells us nothing about a pending refresh — saying
  // 'fresh' there would point the next investigation at the wrong one of the three causes.
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return 'unreadable';
  return expiresAt <= nowMs ? 'expired' : 'fresh';
}

/**
 * Read and classify the persisted session. Never throws: Safari in private mode (and a blocked
 * "all cookies and site data" setting) makes even reading localStorage throw, and that is a
 * diagnostic result in its own right — not a reason to break the boot.
 */
export function probeStoredSession(apiKey: string, nowMs: number = Date.now()): StoredSessionState {
  if (typeof localStorage === 'undefined') return 'unreadable';
  try {
    return classifyStoredSession(localStorage.getItem(storedSessionKey(apiKey)), nowMs);
  } catch {
    return 'unreadable';
  }
}

/** Database and object store Firebase Auth's indexedDBLocalPersistence keeps the user in. */
export const FIREBASE_AUTH_IDB_NAME = 'firebaseLocalStorageDb';
const FIREBASE_AUTH_IDB_STORE = 'firebaseLocalStorage';

/**
 * Read and classify the session Firebase Auth persisted in IndexedDB — the store an
 * IndexedDB-first (Chromium) browser restores from, which `probeStoredSession` cannot see.
 *
 * SCS-AZ's Android events reported `session:stored:none` from localStorage, which on that path
 * says nothing: the session sits in IndexedDB. Asynchronous by nature, so the caller marks the
 * result when it arrives — and a mark that never arrives before the stall report is the
 * reading: the IndexedDB read itself hung.
 *
 * Opens the database only when `indexedDB.databases()` lists it. A bare `open()` of a missing
 * database would create an empty one at version 1, and the SDK would then have to delete and
 * recreate it — this probe must not change what it measures. Without `databases()` it reports
 * 'unreadable' rather than risk that. Never rejects.
 */
export async function probeStoredSessionIdb(apiKey: string, nowMs: () => number = Date.now): Promise<StoredSessionState> {
  try {
    if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return 'unreadable';
    const dbs = await indexedDB.databases();
    if (!dbs.some(d => d.name === FIREBASE_AUTH_IDB_NAME)) return 'none';
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(FIREBASE_AUTH_IDB_NAME);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      // Never block the SDK's own delete/upgrade of the database.
      db.onversionchange = () => db.close();
      if (!db.objectStoreNames.contains(FIREBASE_AUTH_IDB_STORE)) return 'none';
      const row = await new Promise<unknown>((resolve, reject) => {
        const req = db.transaction(FIREBASE_AUTH_IDB_STORE, 'readonly')
          .objectStore(FIREBASE_AUTH_IDB_STORE)
          .get(storedSessionKey(apiKey));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (!row) return 'none';
      return classifyStoredUser((row as { value?: unknown }).value, nowMs());
    } finally {
      db.close();
    }
  } catch {
    return 'unreadable';
  }
}
