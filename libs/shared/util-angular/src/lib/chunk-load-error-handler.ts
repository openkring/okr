import { ErrorHandler } from '@angular/core';

/**
 * Messages browsers emit when a lazily-imported ES module (an Angular lazy route
 * or `@defer` chunk) can't be fetched. After a deploy replaces the hashed chunk
 * files, a client still running the old build hits one of these:
 *   Firefox: "error loading dynamically imported module: https://…"
 *   Chrome/V8: "Failed to fetch dynamically imported module: https://…"
 *   Safari/WebKit: "Importing a module script failed."
 *
 * When the request for the missing chunk is caught by the SPA rewrite and served
 * `index.html` (200, `text/html`) instead of a 404, the module *loads* but fails
 * the MIME-type check — a different wording that must also be recognised (SCS-1A):
 *   Safari/WebKit: "'text/html' is not a valid JavaScript MIME type."
 *   Chrome/V8: 'Expected a JavaScript module script but the server responded with
 *              a MIME type of "text/html". …'
 */
const STALE_CHUNK_RE =
  /error loading dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed|is not a valid JavaScript MIME type|Expected a JavaScript module script/i;

/** sessionStorage key recording when we last auto-reloaded to recover a stale chunk. */
export const STALE_CHUNK_RELOAD_KEY = 'okr-stale-chunk-reload-at';

/** Never auto-reload twice within this window — guards against a reload loop. */
const RELOAD_MIN_INTERVAL_MS = 60 * 1000; // 1 minute

/** True when the error is a failed dynamic import of a (now-stale) lazy chunk. */
export function isStaleChunkError(error: unknown): boolean {
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : (error as { message?: string } | null | undefined)?.message ?? '';
  return STALE_CHUNK_RE.test(message);
}

/** Set once we trigger a recovery reload — the page is on its way out. */
let recoveryInFlight = false;

/**
 * True once a recovery reload has been triggered on this page. Sentry's beforeSend
 * uses it to drop the error we are already recovering from, so a routine
 * stale-client-after-deploy never becomes an issue.
 */
export function isStaleChunkRecoveryInFlight(): boolean {
  return recoveryInFlight;
}

/**
 * Recover from a stale lazy-chunk failure by reloading once, which fetches the current
 * deployment instead of leaving the user on a broken page (SCS-19).
 *
 * Returns true only when `error` was a stale-chunk failure AND the reload was triggered
 * — i.e. the caller may drop the error. Returns false for unrelated errors and for a
 * repeat failure suppressed by the loop guard (the chunk is *still* missing right after
 * a reload, i.e. a genuinely broken deploy rather than merely a stale client), so that
 * actionable case stays reportable.
 *
 * VersionCheckService already reloads when the *service worker* declares its state
 * unrecoverable, but that path can't fire before the SW takes control
 * (registerWhenStable:30000) or when the SW is disabled.
 */
export function recoverFromStaleChunk(error: unknown): boolean {
  if (!isStaleChunkError(error)) return false;
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return false;
  const lastReloadAt = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0);
  if (Date.now() - lastReloadAt < RELOAD_MIN_INTERVAL_MS) return false;
  sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()));
  recoveryInFlight = true;
  window.location.reload();
  return true;
}

/**
 * Recover from stale-chunk failures that never reach Angular's ErrorHandler.
 *
 * A rejected dynamic import often surfaces as an unhandled promise rejection instead
 * (SCS-1N: mechanism `auto.browser.global_handlers.onunhandledrejection`), so
 * ChunkLoadErrorHandler below never sees it and the user is left on a dead page.
 * Both paths share the same one-reload-per-minute guard.
 *
 * Call this BEFORE Sentry.init so this listener runs before Sentry's own
 * onunhandledrejection handler and the in-flight flag is set when beforeSend reads it.
 */
export function registerStaleChunkRecovery(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('unhandledrejection', (event) => {
    // preventDefault only silences the browser's own console report; Sentry's
    // listener still fires, which is why beforeSend checks the in-flight flag.
    if (recoverFromStaleChunk(event.reason)) event.preventDefault();
  });
}

/**
 * ErrorHandler that recovers from stale lazy-chunk failures by reloading once, and
 * delegates every other error to the wrapped handler (Sentry's).
 */
export class ChunkLoadErrorHandler implements ErrorHandler {
  constructor(private readonly delegate: ErrorHandler) {}

  handleError(error: unknown): void {
    if (recoverFromStaleChunk(error)) return;
    this.delegate.handleError(error);
  }
}

/** sessionStorage key recording when we last auto-reloaded to recover a failed app-shell boot. */
export const BOOT_FAILURE_RELOAD_KEY = 'okr-boot-failure-reload-at';

/**
 * Recover from an app shell that never rendered — the `@error` branch of the root `@defer`
 * in `okr-root` (SCS-7N).
 *
 * That branch is NOT reachable from `ChunkLoadErrorHandler` or `registerStaleChunkRecovery`:
 * Angular catches the deferred import's rejection internally, renders `@error`, and neither
 * rethrows into `ErrorHandler` nor leaves an unhandled rejection. So the user was left on a
 * dead-end page telling them to "try again" with nothing to press, and no Sentry event was
 * ever filed for the failure itself.
 *
 * Uses its own guard key rather than STALE_CHUNK_RELOAD_KEY so a boot failure still gets its
 * one automatic retry even when a stale-chunk reload already happened in this session.
 *
 * Returns true when the reload was triggered — false on the server, without sessionStorage,
 * or when the guard already fired (i.e. reloading did not help, so leave the retry to the user).
 */
export function recoverFromBootFailure(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    // The `typeof` guard must live INSIDE the try, and so must every access: Chrome throws a
    // SecurityError on the mere `sessionStorage` property lookup when site data is blocked for
    // the origin — which is exactly the environment that produces this failure mode (SCS-7N).
    // Degrade to "no automatic retry" rather than throwing out of the error screen itself.
    if (typeof sessionStorage === 'undefined') return false;
    const lastReloadAt = Number(sessionStorage.getItem(BOOT_FAILURE_RELOAD_KEY) ?? 0);
    if (Date.now() - lastReloadAt < RELOAD_MIN_INTERVAL_MS) return false;
    sessionStorage.setItem(BOOT_FAILURE_RELOAD_KEY, String(Date.now()));
  } catch { return false; }
  window.location.reload();
  return true;
}

/**
 * User-initiated retry from the boot-error screen: tear down the caching layers that can pin a
 * client to a broken build, then reload.
 *
 * Unlike `recoverFromBootFailure` this is NOT rate-limited — the user asked for it — and it goes
 * further than a plain reload because the failure survives one by definition (the automatic retry
 * already ran). Unregistering ngsw and dropping its caches is what the user would otherwise have
 * to do by hand in the browser settings. Every step is best-effort: in a storage-denied context
 * these APIs throw or are absent, and the reload must still happen.
 */
export async function forceBootRecovery(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(BOOT_FAILURE_RELOAD_KEY);
  } catch { /* storage denied — see recoverFromBootFailure */ }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
  } catch { /* denied or unsupported */ }
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch { /* denied or unsupported */ }
  window.location.reload();
}
