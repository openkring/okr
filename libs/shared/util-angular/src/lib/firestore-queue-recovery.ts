import { captureMessage, flush } from '@sentry/angular';

/**
 * Recovery from a permanently failed Firestore AsyncQueue (SCS-4P).
 *
 * Firestore runs every operation on a single internal AsyncQueue. When any task on it
 * throws, the queue is marked failed FOREVER: `verifyNotFailed()` then throws
 * "INTERNAL ASSERTION FAILED: Unexpected state (ID: b815) … AsyncQueue is already failed"
 * on every subsequent enqueue, roughly once per watch-stream message. From that moment
 * Firestore is dead in the tab — no snapshot ever resolves again, spinners never clear,
 * and there is no supported way back: `terminate()` and `clearPersistence()` have to
 * enqueue too, so they fail as well. Only a page reload builds a fresh queue.
 *
 * The b815 assertion is therefore never the bug, only the flood. The original fault is
 * carried in its `CONTEXT.el` payload, and we have hit two of them:
 *
 * - Single-tab manager: a second tab could not take the exclusive IndexedDB lock, which
 *   failed the queue on startup. Fixed in 2026-08 by moving to the multi-tab manager
 *   (see FIRESTORE in @okr/shared-config) — which traded it for the next one.
 * - Multi-tab manager: "Cannot read properties of null (reading 'isCorePipeline')".
 *   `localStoreGetCachedTarget()` returns null when a targetId another tab advertises via
 *   localStorage is absent from this tab's IndexedDB target cache (tab handover, a
 *   primary-lease change, drifted stores). The `debugAssert(!!target, …)` that would catch
 *   it is compiled out of release builds, so the null reaches
 *   `targetIsPipelineTarget(null)` in the SDK's core/target.ts and throws. Still unguarded
 *   on firebase-js-sdk main as of @firebase/firestore 4.17.x, so no upgrade fixes it, and
 *   4.15.0 has the same latent null with a different message.
 *
 * Both are SDK-internal and neither tab manager is safe, so recovery — not configuration —
 * is what actually protects the user. Matching the assertion itself covers whatever the
 * next underlying fault turns out to be.
 */
const FIRESTORE_QUEUE_FAILED_RE = /FIRESTORE \([\d.]+\) INTERNAL ASSERTION FAILED/i;

/** sessionStorage key recording when we last auto-reloaded to recover a failed Firestore queue. */
export const FIRESTORE_QUEUE_RELOAD_KEY = 'okr-firestore-queue-reload-at';

/** Never auto-reload twice within this window — guards against a reload loop. */
const RELOAD_MIN_INTERVAL_MS = 60 * 1000; // 1 minute

/** How long to wait for the report to leave the client before tearing the page down. */
const FLUSH_TIMEOUT_MS = 2000;

/** Extract a message from whatever shape the global handlers hand us. */
function messageOf(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  const message = (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === 'string' ? message : '';
}

/** True when the error means Firestore's AsyncQueue has failed and the tab's Firestore is dead. */
export function isFirestoreQueueFailure(error: unknown): boolean {
  return FIRESTORE_QUEUE_FAILED_RE.test(messageOf(error));
}

/** Set once we trigger a recovery reload — the page is on its way out. */
let recoveryInFlight = false;

/**
 * True once a recovery reload has been triggered on this page. Sentry's `beforeSend` uses it
 * to drop the b815 flood: the failure is reported ONCE, explicitly, by `recoverFromFirestoreQueueFailure`,
 * and the dozens of identical assertions that follow it in the same second carry no extra
 * information. Without this, a single dead queue files an issue per watch-stream message.
 */
export function isFirestoreQueueRecoveryInFlight(): boolean {
  return recoveryInFlight;
}

/**
 * Recover from a failed Firestore AsyncQueue by reloading once.
 *
 * Reports the failure first (the raw events are suppressed from here on, and a silent
 * auto-reload would otherwise erase the only evidence that Firestore died), then reloads
 * so the user gets a working app instead of spinners that never clear.
 *
 * Returns true when `error` was a queue failure AND the reload was triggered — i.e. the
 * caller may treat the error as handled. Returns false for unrelated errors and for a repeat
 * failure suppressed by the loop guard: the queue failing AGAIN right after a reload means
 * reloading does not fix it, so that case stays reportable rather than looping the page.
 */
export function recoverFromFirestoreQueueFailure(error: unknown): boolean {
  if (!isFirestoreQueueFailure(error)) return false;
  if (typeof window === 'undefined') return false;
  try {
    // The `typeof` guard must live INSIDE the try, and so must every access: Chrome throws a
    // SecurityError on the mere `sessionStorage` property lookup when site data is blocked
    // for the origin — the same environment that already produced SCS-7N.
    if (typeof sessionStorage === 'undefined') return false;
    const lastReloadAt = Number(sessionStorage.getItem(FIRESTORE_QUEUE_RELOAD_KEY) ?? 0);
    if (Date.now() - lastReloadAt < RELOAD_MIN_INTERVAL_MS) return false;
    sessionStorage.setItem(FIRESTORE_QUEUE_RELOAD_KEY, String(Date.now()));
  } catch { return false; }

  recoveryInFlight = true;
  // The assertion message embeds the underlying fault in its CONTEXT payload — that is the
  // only place the real cause (e.g. the isCorePipeline TypeError) is ever visible, so keep
  // the message verbatim rather than summarising it.
  captureMessage('Firestore AsyncQueue failed — auto-reloading', {
    level: 'error',
    tags: { firestoreQueueFailure: 'true' },
    extra: { assertion: messageOf(error).slice(0, 2000), url: window.location?.href },
  });
  // The reload tears the page down; without a flush the report never leaves the client.
  void flush(FLUSH_TIMEOUT_MS).catch(() => false).then(() => window.location.reload());
  return true;
}

/**
 * Recover from Firestore AsyncQueue failures wherever they surface.
 *
 * The b815 assertion is thrown from inside the SDK's own IndexedDB and stream callbacks, so
 * it reaches neither Angular's ErrorHandler nor any promise of ours — it arrives as a global
 * `error` event (SCS-4P's events all carry mechanism `auto.browser.global_handlers.onerror`).
 * `unhandledrejection` is covered too because the same `fail()` is reached from async SDK
 * paths, and which of the two fires depends on where in the queue the enqueue happened.
 *
 * Call this BEFORE Sentry.init so these listeners run before Sentry's own global handlers
 * and the in-flight flag is already set when `beforeSend` reads it.
 */
export function registerFirestoreQueueRecovery(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    // `event.error` is absent for cross-origin script errors; fall back to the message.
    recoverFromFirestoreQueueFailure(event.error ?? event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    // preventDefault only silences the browser's own console report; Sentry's listener still
    // fires, which is why beforeSend checks the in-flight flag.
    if (recoverFromFirestoreQueueFailure(event.reason)) event.preventDefault();
  });
}
