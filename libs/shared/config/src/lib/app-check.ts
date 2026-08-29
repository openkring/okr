import { getToken, type AppCheck } from 'firebase/app-check';

/**
 * App Check token access for code that runs OUTSIDE the app bootstrap.
 *
 * App Check is ENFORCED on Firestore for this project, so every Firestore request carries an
 * App Check token. The token is short-lived and refreshed by a timer
 * (`isTokenAutoRefreshEnabled: true` in each app's main.ts). A timer is exactly what a
 * backgrounded tab does not get: Safari (and every WebKit browser on iOS) throttles and
 * eventually suspends timers in hidden tabs, so a tab that has been in the background for a
 * while wakes up holding an EXPIRED token. The Firebase SDK then attaches a placeholder token
 * to the first request, the backend answers PERMISSION_DENIED, and — because permission-denied
 * is not retryable — a write rejects outright rather than being retried.
 *
 * That is what made the first write fired on tab resume (the session create in
 * `SessionService.startSession`) intermittently fail with a user-facing toast on Safari.
 *
 * `initializeAppCheck()` returns the instance to the app's main.ts, which is not injectable
 * context and not reachable from a lib. So main.ts hands the instance here via
 * `registerAppCheck()`, and libs await `ensureAppCheckToken()` before a resume-time write.
 */
let appCheckInstance: AppCheck | undefined;

/** Called once from each app's main.ts, right after initializeAppCheck(). */
export function registerAppCheck(instance: AppCheck): void {
  appCheckInstance = instance;
}

/**
 * Wait until a VALID App Check token is in the SDK's cache, so the next Firestore request does
 * not go out with an expired one. `getToken()` returns the cached token when it is still valid
 * and only performs a fresh reCAPTCHA attestation round trip when it is not, so calling this on
 * every tab resume is cheap in the common case.
 *
 * Bounded and never throws: on a privacy-hardened browser the reCAPTCHA script can be blocked
 * outright and the attestation then hangs or rejects. Callers use this as a best-effort
 * pre-flight — if it fails, the write proceeds anyway and fails on its own terms rather than
 * leaving the caller waiting forever.
 *
 * `forceRefresh` skips the cache and attests anew. Use it only AFTER the backend has rejected a
 * request with PERMISSION_DENIED: the cached token is then valid by the client's own clock (or the
 * SDK would have refreshed it on its own) yet demonstrably not accepted — the one situation where
 * asking again is not wasted work.
 *
 * @param timeoutMs how long to wait for attestation before giving up and letting the caller proceed
 * @param forceRefresh attest anew instead of returning the cached token
 * @return true when a valid token is cached, false when App Check is unregistered, blocked or slow
 */
export async function ensureAppCheckToken(timeoutMs = 5000, forceRefresh = false): Promise<boolean> {
  if (!appCheckInstance) return false;
  try {
    await Promise.race([
      getToken(appCheckInstance, forceRefresh),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('App Check getToken timed out')), timeoutMs)),
    ]);
    return true;
  } catch (ex) {
    console.warn('ensureAppCheckToken: App Check attestation unavailable:', ex);
    return false;
  }
}
