import type { HttpInterceptorFn } from '@angular/common/http';
import { addBreadcrumb, setTag, setUser } from '@sentry/angular';
import type { BrowserOptions, ErrorEvent, EventHint } from '@sentry/angular';
import { redactSensitive, stripPii } from '@okr/shared-util-core';
import { catchError } from 'rxjs';
import { isStaleChunkRecoveryInFlight } from './chunk-load-error-handler';

/** Sentry configuration as emitted into environment.ts by set-env.js. */
export interface SentryConfig {
  dsn: string;
  environment: 'development' | 'staging' | 'production';
  release: string;
  tracesSampleRate: number;
  enabled: boolean;
}

/** Final scrubbing gate — runs on every event before it leaves the client. */
export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
  // Backstop: never send development noise (enabled:false already prevents this in dev).
  if (event.environment === 'development') return null;

  // Backstop against stale prod config on a dev server (SCS-1N): a release build
  // regenerates environment.ts with enabled:true/environment:'production'; a localhost
  // tab bundled from that file then reports dev-serve noise (e.g. chunk-invalidation
  // errors after a rebuild) as production. The explicit-port check keeps Capacitor
  // native shells (capacitor://localhost, https://localhost — no port) reporting.
  const loc = globalThis.location;
  if (loc && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname) && loc.port !== '') return null;

  // A stale client after a deploy is expected, not a defect: registerStaleChunkRecovery
  // already triggered the reload that fixes it, so don't also file an issue (SCS-1N).
  // Only the *recovered* case is dropped — when the loop guard suppresses the reload
  // (a genuinely broken deploy) the flag stays false and the event goes through.
  if (isStaleChunkRecoveryInFlight()) return null;

  // Injected in-app-browser script, not our code (SCS-4A): the Google iOS app scans the
  // page with a recursive DOM walker (findTopmostVisibleElement → isOpaqueElement → isImage)
  // that blows the stack on a long CMS page. The frames carry OUR page URL because the
  // script is injected inline, so denyUrls can't catch it and the message
  // ("Maximum call stack size exceeded") is too generic for ignoreErrors — match the
  // function names instead. Nothing on our side is actionable.
  const injectedScanner = /^(findTopmostVisibleElement|isOpaqueElement|isImage)$/;
  const fromInjectedScanner = event.exception?.values?.some((v) =>
    v.stacktrace?.frames?.some((f) => injectedScanner.test(f.function ?? '')),
  );
  if (fromInjectedScanner) return null;

  if (event.message) event.message = redactSensitive(event.message);
  event.exception?.values?.forEach((v) => { v.value = redactSensitive(v.value); });
  event.breadcrumbs?.forEach((b) => { b.message = redactSensitive(b.message); });

  return event;
}

/** One options object shared by every app, guaranteeing identical behaviour. */
export function buildSentryOptions(
  cfg: SentryConfig,
  integrations: BrowserOptions['integrations'],
): BrowserOptions {
  return {
    dsn: cfg.dsn,
    environment: cfg.environment,
    enabled: cfg.enabled,
    release: cfg.release,

    integrations,

    // Benign noise we never want as issues. Backstop only — the source helpers
    // (takePhoto/pickPhoto) already swallow camera cancellations; this guards any
    // call site that bypasses them. The Capacitor cancel message is "User cancelled photos app".
    ignoreErrors: [
      /User cancelled photos app/i,
      // Transient transport artifact, not a content bug: when Safari aborts an in-flight
      // request (reload / navigate-away / bfcache eviction) the Firebase SDK JSON-parses the
      // empty/truncated body and throws an end-of-input error. Per-call-site try/catch guards
      // (e.g. the AOC-bexio stat loaders) can't cover every in-flight request, so suppress the
      // whole class centrally. These messages only mean "input ended early" (truncated/empty),
      // never malformed content — a real bad response yields "Unexpected token …", and a failed
      // Cloud Function rejects as a FirebaseError, so nothing actionable is hidden.
      // Safari: "JSON Parse error: Unexpected EOF" · V8: "Unexpected end of JSON input" · Firefox: "unexpected end of data".
      /Unexpected EOF|Unexpected end of JSON input|unexpected end of data/i,
      // WebKit-internal rejection, not our code: WKWebView-based in-app browsers (DuckDuckGo,
      // Facebook, etc. on iOS) inject their own message-handler bridges; when a native handler
      // doesn't reply in time the injected JS rejects with this. It surfaces as an
      // onunhandledrejection with no stacktrace and nothing actionable on our side.
      /WKWebView API client did not respond to this postMessage/i,
      // Browser-extension bridge, not our code (SCS-2B): a content script injected into the
      // page calls chrome/browser.runtime.sendMessage() and the extension's background page
      // is gone (tab closed, extension reloaded). Arrives as an onunhandledrejection with no
      // stacktrace; nothing on our side is actionable.
      /Invalid call to runtime\.sendMessage\(\)/i,
    ],

    // Crashes inside third-party scripts we load but don't own. reCAPTCHA (pulled in by
    // Firebase AppCheck) throws inside its own obfuscated bundle on some clients (SCS-1Q:
    // "Cannot read properties of undefined (reading 'oT')" — every frame in
    // recaptcha__<lang>.js, typically a bot-like UA); nothing on our side is actionable.
    denyUrls: [/\/recaptcha\/releases\//],

    tracesSampleRate: cfg.tracesSampleRate,
    tracePropagationTargets: [
      /^https:\/\/[^/]*\.cloudfunctions\.net/,
      /^https:\/\/firestore\.googleapis\.com/,
    ],

    // DSG: do NOT auto-attach IP / headers / cookies.
    sendDefaultPii: false,

    beforeSend,
  };
}

/**
 * Attaches failed HTTP calls as breadcrumbs (not separate issues, which would flood the
 * dashboard). The URL query string is stripped so identifiers never enter a breadcrumb.
 */
export const httpBreadcrumbInterceptor: HttpInterceptorFn = (req, next) =>
  next(req).pipe(
    catchError((err) => {
      addBreadcrumb({
        category: 'http',
        level: 'error',
        message: `${req.method} ${stripPii(req.urlWithParams)} → ${err?.status ?? '?'}`,
      });
      throw err;
    }),
  );

/** Set pseudonymous user/tenant/role context. id MUST be a Firebase UID, never an email. */
export function setSentryUser(id: string, tenant: string, roles: readonly string[]): void {
  setUser({ id });
  setTag('mandant', tenant);
  setTag('role', roles.join(','));
}

/** Clear all user context (call on logout). */
export function clearSentryUser(): void {
  setUser(null);
}
