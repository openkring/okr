import { activeFirebaseAppName } from '@okr/shared-config';

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
 * The key Firebase Auth persists the current user under: per FirebaseApp name. Tenant apps use the
 * default app (`[DEFAULT]`); the iOS portal names the app after the tenant (spec 1.179).
 */
export function storedSessionKey(apiKey: string, appName = activeFirebaseAppName()): string {
  return `firebase:authUser:${apiKey}:${appName}`;
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
 * Opens the database only when it already exists (see `openExistingAuthDb`); without
 * `indexedDB.databases()` it reports 'unreadable' rather than risk a blind open. Never rejects.
 */
export async function probeStoredSessionIdb(apiKey: string, nowMs: () => number = Date.now): Promise<StoredSessionState> {
  try {
    const db = await openExistingAuthDb();
    if (!db) return db === null ? 'none' : 'unreadable';
    try {
      if (!db.objectStoreNames.contains(FIREBASE_AUTH_IDB_STORE)) return 'none';
      const row = await idbRequest<unknown>(db.transaction(FIREBASE_AUTH_IDB_STORE, 'readonly')
        .objectStore(FIREBASE_AUTH_IDB_STORE)
        .get(storedSessionKey(apiKey)));
      if (!row) return 'none';
      return classifyStoredUser((row as { value?: unknown }).value, nowMs());
    } finally {
      db.close();
    }
  } catch {
    return 'unreadable';
  }
}

/**
 * The IndexedDB twin of `dropExpiredSessionAfterStall` (@okr/shared-config): the way out of a
 * restore that hangs renewing an expired session on the IndexedDB-first (Chromium) path.
 *
 * SCS-AZ kept recurring on Android Chrome and Samsung Internet with `session:idb:expired`: the
 * SDK must renew the expired ID token at securetoken.googleapis.com before it emits, on a weak
 * network that request hangs, and the localStorage escape could not help — the session is not in
 * localStorage. Unlike there, this store cannot be cleared synchronously before `initializeAuth`
 * on the next boot, so the restore watchdog calls this on the STALLED boot instead. Either way
 * the user ends up where they can act: if the renewal still completes, the SDK writes the user
 * back; if it does not, the "try again" boot finds no session and shows the login page. The cost
 * is one sign-in, for a user who could not get in at all.
 *
 * Deletes only a row that is expired at the moment of deleting, inside one readwrite transaction,
 * so a renewal that landed in the meantime is never thrown away. Never rejects.
 *
 * @returns true when an expired session was removed
 */
export async function dropExpiredSessionIdb(apiKey: string, nowMs: () => number = Date.now): Promise<boolean> {
  try {
    const db = await openExistingAuthDb();
    if (!db) return false;
    try {
      if (!db.objectStoreNames.contains(FIREBASE_AUTH_IDB_STORE)) return false;
      const store = db.transaction(FIREBASE_AUTH_IDB_STORE, 'readwrite').objectStore(FIREBASE_AUTH_IDB_STORE);
      const key = storedSessionKey(apiKey);
      const row = await idbRequest<unknown>(store.get(key));
      if (!row || classifyStoredUser((row as { value?: unknown }).value, nowMs()) !== 'expired') return false;
      await idbRequest(store.delete(key));
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

/**
 * Open Firebase Auth's database only when `indexedDB.databases()` lists it. A bare `open()` of a
 * missing database would create an empty one at version 1, and the SDK would then have to delete
 * and recreate it — these helpers must not change what they look at.
 *
 * @returns the open database; null when it does not exist; undefined when that cannot be told
 *   without the risky blind open (no IndexedDB, or no `databases()`)
 */
async function openExistingAuthDb(): Promise<IDBDatabase | null | undefined> {
  if (typeof indexedDB === 'undefined' || typeof indexedDB.databases !== 'function') return undefined;
  const dbs = await indexedDB.databases();
  if (!dbs.some(d => d.name === FIREBASE_AUTH_IDB_NAME)) return null;
  const db = await idbRequest<IDBDatabase>(indexedDB.open(FIREBASE_AUTH_IDB_NAME));
  // Never block the SDK's own delete/upgrade of the database.
  db.onversionchange = () => db.close();
  return db;
}

function idbRequest<T>(req: IDBRequest<T> | IDBOpenDBRequest): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}
