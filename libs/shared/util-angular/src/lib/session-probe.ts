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
