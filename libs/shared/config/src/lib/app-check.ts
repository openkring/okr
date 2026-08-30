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

/**
 * The forced attestation that is currently running, shared by every caller that arrives while it
 * is in flight. Without this, a denial incident fans out into one reCAPTCHA Enterprise round trip
 * PER LISTENER: the backend kills every open Firestore listener at once, and each one's recovery
 * (`FirestoreService.recoverFromTokenDenial`) calls in here independently. With ~20 open listeners
 * that is ~20 concurrent attestations for one and the same token — a self-inflicted thundering
 * herd that reCAPTCHA answers with throttling, which produces more denials.
 */
let pendingForcedRefresh: Promise<boolean> | undefined;

/**
 * When the last forced attestation SUCCEEDED. Denials of a single incident do not arrive at the
 * same instant — they trickle in over a second or two as each listener's error propagates — so
 * in-flight sharing alone still lets a burst through. A token minted moments ago is the freshest
 * answer available; asking again cannot produce a better one. A denial that survives a
 * just-minted token is not about the token, which is precisely the case the caller's retry budget
 * already ends.
 *
 * Failures are deliberately NOT stamped: a blocked or timed-out attestation must stay retryable.
 */
let lastForcedRefreshAt = 0;

/** How long a successful forced attestation answers for subsequent forced calls. */
const FORCE_REFRESH_COOLDOWN_MS = 10_000;

/** Called once from each app's main.ts, right after initializeAppCheck(). */
export function registerAppCheck(instance: AppCheck): void {
  appCheckInstance = instance;
  // A new instance invalidates everything the old one attested.
  pendingForcedRefresh = undefined;
  lastForcedRefreshAt = 0;
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
 * asking again is not wasted work. Forced calls are COALESCED: concurrent ones share a single
 * attestation, and one that follows a success within FORCE_REFRESH_COOLDOWN_MS is answered from
 * that success — a denial incident must not turn into one reCAPTCHA round trip per listener.
 *
 * @param timeoutMs how long to wait for attestation before giving up and letting the caller proceed
 * @param forceRefresh attest anew instead of returning the cached token
 * @return true when a valid token is cached, false when App Check is unregistered, blocked or slow
 */
export async function ensureAppCheckToken(timeoutMs = 5000, forceRefresh = false): Promise<boolean> {
  if (!appCheckInstance) return false;

  // The cached path is a local lookup in the SDK, so it needs no coalescing.
  if (!forceRefresh) return attest(appCheckInstance, false, timeoutMs);

  if (pendingForcedRefresh) return pendingForcedRefresh;
  if (Date.now() - lastForcedRefreshAt < FORCE_REFRESH_COOLDOWN_MS) return true;

  pendingForcedRefresh = attest(appCheckInstance, true, timeoutMs)
    .then((attested) => {
      if (attested) lastForcedRefreshAt = Date.now();
      return attested;
    })
    .finally(() => { pendingForcedRefresh = undefined; });
  return pendingForcedRefresh;
}

/** One bounded attestation round trip. Never throws — see the contract above. */
async function attest(instance: AppCheck, forceRefresh: boolean, timeoutMs: number): Promise<boolean> {
  try {
    await Promise.race([
      getToken(instance, forceRefresh),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('App Check getToken timed out')), timeoutMs)),
    ]);
    return true;
  } catch (ex) {
    console.warn('ensureAppCheckToken: App Check attestation unavailable:', ex);
    return false;
  }
}
