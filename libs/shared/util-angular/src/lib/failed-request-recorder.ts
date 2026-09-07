import { stripPii } from '@okr/shared-util-core';

/**
 * A request that came back non-ok (or never came back at all).
 *
 * `status` is the HTTP status; 0 means the request threw before a response existed
 * (offline, DNS, CORS). Note that with the Angular service worker installed a *failed*
 * request usually does NOT surface as 0: ngsw's `safeFetch` swallows the exception and
 * hands the caller a synthetic `504 Gateway Timeout` with an empty body. That synthetic
 * 504 is exactly what SCS-A8 reported, with no way to tell which request produced it —
 * hence this recorder.
 */
export interface FailedRequest {
  /** Request URL with its query string removed (stripPii) — never a raw identifier. */
  url: string;
  /** HTTP status, or 0 when the request threw. */
  status: number;
  /** Epoch millis. */
  at: number;
}

/** Keep the tail short: this rides along on error events, it is not a request log. */
const MAX_ENTRIES = 5;

const recent: FailedRequest[] = [];
let installed = false;

function record(url: string, status: number): void {
  recent.push({ url: stripPii(url), status, at: Date.now() });
  if (recent.length > MAX_ENTRIES) recent.shift();
}

/** The most recent failed requests, oldest first. Safe to attach to a Sentry event. */
export function getRecentFailedRequests(): readonly FailedRequest[] {
  return recent;
}

/** True when a request to a host matching `hostPattern` failed within the last `withinMs`. */
export function hasRecentFailedRequest(hostPattern: RegExp, withinMs: number): boolean {
  const since = Date.now() - withinMs;
  return recent.some((r) => r.at >= since && hostPattern.test(r.url));
}

/** Test seam — drops everything recorded so far. */
export function clearRecentFailedRequests(): void {
  recent.length = 0;
}

/**
 * Wrap `fetch` and `XMLHttpRequest` so every non-ok response is remembered.
 *
 * Sentry already records fetch/xhr breadcrumbs, but breadcrumbs are trimmed and scrubbed
 * server-side (`[Filtered]`), and the interesting request is often the one that fell off
 * the end. This keeps a short, deliberately PII-free tail that `beforeSend` attaches to the
 * event, so an error that arrives with no stacktrace still says which request preceded it.
 *
 * Call once, as early as possible (init-sentry.ts). Wrapping is idempotent and must never
 * change the observable behaviour of either transport: every path re-throws or re-returns
 * what it received.
 */
export function installFailedRequestRecorder(): void {
  if (installed || typeof globalThis === 'undefined') return;
  installed = true;

  const originalFetch = globalThis.fetch;
  if (typeof originalFetch === 'function') {
    globalThis.fetch = async function (this: unknown, ...args: Parameters<typeof fetch>): Promise<Response> {
      const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof URL ? args[0].href : (args[0] as Request)?.url ?? '';
      try {
        const response = await originalFetch.apply(this, args);
        if (!response.ok) record(url, response.status);
        return response;
      } catch (ex) {
        record(url, 0);
        throw ex;
      }
    };
  }

  const XHR = globalThis.XMLHttpRequest;
  if (typeof XHR === 'function') {
    const originalOpen = XHR.prototype.open;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    XHR.prototype.open = function (this: XMLHttpRequest & { __okrUrl?: string }, ...args: any[]) {
      this.__okrUrl = String(args[1] ?? '');
      this.addEventListener('loadend', () => {
        if (this.status === 0 || this.status >= 400) record(this.__okrUrl ?? '', this.status);
      });
      return originalOpen.apply(this, args as Parameters<XMLHttpRequest['open']>);
    };
  }
}
