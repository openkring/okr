import { ErrorHandler } from '@angular/core';

/**
 * Messages browsers emit when a lazily-imported ES module (an Angular lazy route
 * or `@defer` chunk) can't be fetched. After a deploy replaces the hashed chunk
 * files, a client still running the old build hits one of these:
 *   Firefox: "error loading dynamically imported module: https://…"
 *   Chrome/V8: "Failed to fetch dynamically imported module: https://…"
 *   Safari/WebKit: "Importing a module script failed."
 */
const STALE_CHUNK_RE =
  /error loading dynamically imported module|Failed to fetch dynamically imported module|Importing a module script failed/i;

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

/**
 * ErrorHandler that recovers from stale lazy-chunk failures by reloading once, and
 * delegates every other error to the wrapped handler (Sentry's).
 *
 * VersionCheckService already reloads when the *service worker* declares its state
 * unrecoverable, but that path can't fire before the SW takes control
 * (registerWhenStable:30000) or when the SW is disabled — the dynamic import just
 * rejects and bubbles to the global ErrorHandler. A guarded one-time reload fetches
 * the current deployment instead of leaving the user on a broken page (SCS-19).
 *
 * If the reload is suppressed by the loop guard (the chunk is *still* missing right
 * after a reload — i.e. a genuinely broken deploy, not merely a stale client), the
 * error falls through to the delegate so Sentry still records the actionable case.
 */
export class ChunkLoadErrorHandler implements ErrorHandler {
  constructor(private readonly delegate: ErrorHandler) {}

  handleError(error: unknown): void {
    if (isStaleChunkError(error) && this.reloadOnce()) return;
    this.delegate.handleError(error);
  }

  /** Reload at most once per minute; returns true when a reload was triggered. */
  private reloadOnce(): boolean {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') return false;
    const lastReloadAt = Number(sessionStorage.getItem(STALE_CHUNK_RELOAD_KEY) ?? 0);
    if (Date.now() - lastReloadAt < RELOAD_MIN_INTERVAL_MS) return false;
    sessionStorage.setItem(STALE_CHUNK_RELOAD_KEY, String(Date.now()));
    window.location.reload();
    return true;
  }
}
