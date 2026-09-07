/**
 * Firebase Analytics initialisation is fire-and-forget by construction: `getAnalytics()`
 * returns synchronously and then runs its own promise chain (dynamic config fetch →
 * gtag.js) that nobody owns. When that chain fails — a flaky mobile connection, or the
 * Angular service worker answering a dead fetch with a synthetic `504 Gateway Timeout` —
 * the rejection escapes as an `onunhandledrejection` with no first-party frames and no
 * stacktrace. That is SCS-A8.
 *
 * Analytics is non-essential: nothing in the app waits for it and nothing breaks without
 * it, so its failure must not become an issue in Sentry. We can't attach a `catch` to a
 * promise the SDK keeps to itself, so we mark the window during which such an unowned
 * rejection is attributable to analytics, and `beforeSend` drops exactly that shape inside
 * it. Everything else still reports.
 */

/** How long after init an unowned rejection is still plausibly analytics' own. */
const WINDOW_MS = 20_000;

let openUntil = 0;

/** Called by AnalyticsLoaderService immediately before it touches the SDK. */
export function markAnalyticsInitStarted(): void {
  openUntil = Date.now() + WINDOW_MS;
}

/** True while an analytics initialisation could still be rejecting in the background. */
export function isAnalyticsInitInFlight(): boolean {
  return Date.now() < openUntil;
}

/** Test seam. */
export function closeAnalyticsInitWindow(): void {
  openUntil = 0;
}
