import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/angular';
import { beforeSend, buildSentryOptions, SentryConfig } from './sentry';
import { closeAnalyticsInitWindow, markAnalyticsInitStarted } from './analytics-init-window';
import { clearRecentFailedRequests, installFailedRequestRecorder } from './failed-request-recorder';

const cfg: SentryConfig = {
  dsn: 'https://abc@o1.ingest.de.sentry.io/2',
  environment: 'production',
  release: 'scs@1.2.3',
  tracesSampleRate: 0.1,
  enabled: true,
};

describe('buildSentryOptions', () => {
  it('passes through dsn, environment, release and enabled', () => {
    const o = buildSentryOptions(cfg, []);
    expect(o.dsn).toBe(cfg.dsn);
    expect(o.environment).toBe('production');
    expect(o.release).toBe('scs@1.2.3');
    expect(o.enabled).toBe(true);
  });

  it('never auto-attaches PII and always installs beforeSend', () => {
    const o = buildSentryOptions(cfg, []);
    expect(o.sendDefaultPii).toBe(false);
    expect(o.beforeSend).toBe(beforeSend);
  });

  it('suppresses transient aborted-request JSON-EOF noise across browsers', () => {
    const patterns = (buildSentryOptions(cfg, []).ignoreErrors ?? []) as RegExp[];
    const matches = (msg: string) => patterns.some((p) => p instanceof RegExp && p.test(msg));
    // Safari, V8/Chrome and Firefox variants of an empty/truncated JSON body.
    expect(matches('JSON Parse error: Unexpected EOF')).toBe(true);
    expect(matches('Unexpected end of JSON input')).toBe(true);
    expect(matches('JSON.parse: unexpected end of data')).toBe(true);
    // Must NOT swallow a genuinely malformed-content parse error.
    expect(matches('JSON Parse error: Unexpected token "<"')).toBe(false);
  });

  it('suppresses transient Firebase Auth token-refresh network timeouts (ELAB-1)', () => {
    const patterns = (buildSentryOptions(cfg, []).ignoreErrors ?? []) as RegExp[];
    const matches = (msg: string) => patterns.some((p) => p instanceof RegExp && p.test(msg));
    expect(matches('FirebaseError: Firebase: Error (auth/network-request-failed).')).toBe(true);
    // Must NOT swallow actionable auth failures that point at config or credentials.
    expect(matches('FirebaseError: Firebase: Error (auth/invalid-api-key).')).toBe(false);
    expect(matches('FirebaseError: Firebase: Error (auth/wrong-password).')).toBe(false);
    expect(matches('FirebaseError: Firebase: Error (auth/unauthorized-domain).')).toBe(false);
  });

  it('suppresses browser-extension runtime.sendMessage noise (SCS-2B)', () => {
    const patterns = (buildSentryOptions(cfg, []).ignoreErrors ?? []) as RegExp[];
    const matches = (msg: string) => patterns.some((p) => p instanceof RegExp && p.test(msg));
    expect(matches('Error: Invalid call to runtime.sendMessage(). Tab not found.')).toBe(true);
    expect(matches('Failed to send message to the server')).toBe(false);
  });

  it('suppresses browser-extension host-bridge noise (P13-1)', () => {
    const patterns = (buildSentryOptions(cfg, []).ignoreErrors ?? []) as RegExp[];
    const matches = (msg: string) => patterns.some((p) => p instanceof RegExp && p.test(msg));
    expect(matches('Non-Error promise rejection captured with value: Object Not Found Matching Id:1, MethodName:update, ParamCount:4')).toBe(true);
    expect(matches('Object Not Found Matching Id:7, MethodName:simulateEvent, ParamCount:4')).toBe(true);
    // Must NOT swallow our own not-found errors.
    expect(matches('Object not found')).toBe(false);
    expect(matches('FirebaseError: No document to update')).toBe(false);
  });

  it('suppresses Firebase Auth IndexedDB polls that lose the connection on page teardown (SCS-AN)', () => {
    const patterns = (buildSentryOptions(cfg, []).ignoreErrors ?? []) as RegExp[];
    const matches = (msg: string) => patterns.some((p) => p instanceof RegExp && p.test(msg));
    expect(matches("InvalidStateError: Failed to execute 'transaction' on 'IDBDatabase': The database connection is closing.")).toBe(true);
    // Must NOT swallow actionable IndexedDB failures (quota, blocked upgrade, corrupt store).
    expect(matches('QuotaExceededError: The quota has been exceeded.')).toBe(false);
    expect(matches("InvalidStateError: Failed to execute 'transaction' on 'IDBDatabase': One of the specified object stores was not found.")).toBe(false);
  });

  it('suppresses WebKit IndexedDB purge rejections while a connection is open (SCS-AV)', () => {
    const patterns = (buildSentryOptions(cfg, []).ignoreErrors ?? []) as RegExp[];
    const matches = (msg: string) => patterns.some((p) => p instanceof RegExp && p.test(msg));
    expect(matches('UnknownError: Database deleted by request of the user')).toBe(true);
    expect(matches('Error: UnknownError: Database deleted by request of the user')).toBe(true);
    // Must NOT swallow other UnknownError / delete failures.
    expect(matches('UnknownError: Internal error opening backing store for indexedDB.open.')).toBe(false);
    expect(matches('FirebaseError: Missing or insufficient permissions.')).toBe(false);
  });

  it('drops events originating inside the Google reCAPTCHA script (SCS-1Q)', () => {
    const patterns = (buildSentryOptions(cfg, []).denyUrls ?? []) as RegExp[];
    const matches = (url: string) => patterns.some((p) => p instanceof RegExp && p.test(url));
    // Frame filenames as they appear in real events: relative (first-party-looking) and absolute.
    expect(matches('/recaptcha/releases/A7KpaEASfhDcK0nXxgQEyyYv/recaptcha__en.js')).toBe(true);
    expect(matches('https://www.google.com/recaptcha/releases/abc/recaptcha__en.js')).toBe(true);
    expect(matches('https://www.gstatic.com/recaptcha/releases/abc/recaptcha__de.js')).toBe(true);
    // Must NOT swallow our own bundles.
    expect(matches('https://seeclub.org/main-ABC123.js')).toBe(false);
  });
});

describe('beforeSend', () => {
  // The suite's jsdom origin is a localhost dev-server URL; simulate a deployed
  // origin so the dev-server guard doesn't swallow the events under test.
  beforeEach(() => vi.stubGlobal('location', new URL('https://seeclub.org/')));
  afterEach(() => vi.unstubAllGlobals());

  it('drops development events entirely', () => {
    const event = { environment: 'development', message: 'boom' } as ErrorEvent;
    expect(beforeSend(event, {})).toBeNull();
  });

  it('drops events served from a localhost dev server even when the baked-in config claims production', () => {
    // A stale tab can run a bundle whose environment.ts was generated by a release
    // build (SCS-1N): environment says 'production' but the page is localhost:4201.
    vi.stubGlobal('location', new URL('http://localhost:4201/public/news'));
    const event = { environment: 'production', message: 'Failed to fetch dynamically imported module' } as ErrorEvent;
    expect(beforeSend(event, {})).toBeNull();
  });

  it('drops the stale-chunk error it is already recovering from (SCS-1N)', async () => {
    // Fresh module registry so the recovery flag starts unset and both modules share it.
    vi.resetModules();
    const { recoverFromStaleChunk } = await import('./chunk-load-error-handler');
    const { beforeSend: freshBeforeSend } = await import('./sentry');
    const event = () => ({ environment: 'production', message: 'boom' }) as ErrorEvent;

    expect(freshBeforeSend(event(), {})).not.toBeNull();

    sessionStorage.clear();
    vi.stubGlobal('location', Object.assign(new URL('https://seeclub.org/'), { reload: vi.fn() }));
    expect(recoverFromStaleChunk(new Error('Failed to fetch dynamically imported module: https://x/src-AB12.js'))).toBe(true);

    // The reload is under way — every event from this dying page is now noise.
    expect(freshBeforeSend(event(), {})).toBeNull();
  });

  it('keeps events from Capacitor native shells (localhost without an explicit port)', () => {
    vi.stubGlobal('location', new URL('https://localhost/home'));
    const event = { environment: 'production', message: 'boom' } as ErrorEvent;
    expect(beforeSend(event, {})).not.toBeNull();
  });

  it('drops the Google in-app browser DOM-scanner stack overflow (SCS-4A)', () => {
    const event = {
      environment: 'production',
      exception: {
        values: [{
          value: 'Maximum call stack size exceeded.',
          stacktrace: { frames: [{ function: 'isImage' }, { function: 'findTopmostVisibleElement' }] },
        }],
      },
    } as unknown as ErrorEvent;
    expect(beforeSend(event, {})).toBeNull();
  });

  it('redacts the message of a production event', () => {
    const event = { environment: 'production', message: 'fail for a@b.ch' } as ErrorEvent;
    const out = beforeSend(event, {});
    expect(out?.message).toBe('fail for [EMAIL]');
  });

  it('redacts exception values and breadcrumb messages', () => {
    const event = {
      environment: 'production',
      exception: { values: [{ value: 'AHV 756.1234.5678.90' }] },
      breadcrumbs: [{ message: 'iban CH93 0076 2011 6238 5295 7' }],
    } as unknown as ErrorEvent;
    const out = beforeSend(event, {});
    expect(out?.exception?.values?.[0].value).toContain('[AHV]');
    expect(out?.breadcrumbs?.[0].message).toContain('[IBAN]');
  });
});

describe('beforeSend and unowned object rejections (SCS-A8)', () => {
  /** The event shape Sentry builds for `Promise.reject({ status, message, details })`. */
  const objectRejection = (serialized: Record<string, unknown>): ErrorEvent =>
    ({
      environment: 'production',
      extra: { __serialized__: serialized },
      exception: {
        values: [
          {
            type: 'UnhandledRejection',
            value: 'Object captured as promise rejection with keys: details, message, status',
            mechanism: { type: 'onunhandledrejection', handled: false },
          },
        ],
      },
    }) as unknown as ErrorEvent;

  beforeEach(() => vi.stubGlobal('location', new URL('https://seeclub.org/')));

  afterEach(() => {
    vi.unstubAllGlobals();
    closeAnalyticsInitWindow();
    clearRecentFailedRequests();
  });

  it('drops an anonymous rejection while an analytics init could still be in flight', () => {
    markAnalyticsInitStarted();
    expect(beforeSend(objectRejection({ status: 504, message: 'Gateway Timeout' }), {} as never)).toBeNull();
  });

  it('keeps the same rejection once the analytics window has closed', () => {
    const sent = beforeSend(objectRejection({ status: 504, message: 'Gateway Timeout' }), {} as never);
    expect(sent).not.toBeNull();
  });

  it('retitles the rejection with its status and message instead of its key names', () => {
    const sent = beforeSend(objectRejection({ status: 504, message: 'Gateway Timeout' }), {} as never);
    expect(sent?.exception?.values?.[0].value).toBe('Object captured as promise rejection: 504 Gateway Timeout');
  });

  it('leaves the title alone when the payload says nothing useful', () => {
    const sent = beforeSend(objectRejection({ details: {} }), {} as never);
    expect(sent?.exception?.values?.[0].value).toBe('Object captured as promise rejection with keys: details, message, status');
  });

  it('never drops an error that carries a stacktrace, analytics window or not', () => {
    markAnalyticsInitStarted();
    const event = objectRejection({ status: 504 });
    event.exception!.values![0].stacktrace = { frames: [{ function: 'confirm' }] };
    expect(beforeSend(event, {} as never)).not.toBeNull();
  });
});

describe('beforeSend and Edge-iOS injected rejections (SCS-B2)', () => {
  const EDGE_IOS_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/153.0.4234.0 Mobile/15E148 Safari/605.1.15';
  const SAFARI_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

  const objectRejection = (): ErrorEvent =>
    ({
      environment: 'production',
      extra: { __serialized__: { status: 504, message: 'Gateway Timeout', details: {} } },
      exception: {
        values: [
          {
            type: 'UnhandledRejection',
            value: 'Object captured as promise rejection with keys: details, message, status',
            mechanism: { type: 'onunhandledrejection', handled: false },
          },
        ],
      },
    }) as unknown as ErrorEvent;

  /** The recorder wraps fetch once; tests swap the response behind a stable stub. */
  let fetchImpl: () => Promise<Response> = () => Promise.resolve(new Response(''));
  globalThis.fetch = (() => fetchImpl()) as typeof fetch;
  installFailedRequestRecorder();

  const withUserAgent = (ua: string): void => { vi.stubGlobal('navigator', { userAgent: ua }); };

  beforeEach(() => vi.stubGlobal('location', new URL('https://app.seeclub.org/auth/confirm')));

  afterEach(() => {
    vi.unstubAllGlobals();
    clearRecentFailedRequests();
  });

  it('drops an unowned object rejection on Edge iOS when none of our requests failed', () => {
    withUserAgent(EDGE_IOS_UA);
    expect(beforeSend(objectRejection(), {} as never)).toBeNull();
  });

  it('keeps it on Edge iOS when a request of ours failed just before', async () => {
    withUserAgent(EDGE_IOS_UA);
    fetchImpl = () => Promise.resolve(new Response('', { status: 504 }));
    await fetch('https://app.seeclub.org/api/x');
    const sent = beforeSend(objectRejection(), {} as never);
    expect(sent?.extra?.['recentFailedRequests']).toEqual(['504 https://app.seeclub.org/api/x']);
  });

  it('keeps the same rejection on any other browser', () => {
    withUserAgent(SAFARI_UA);
    expect(beforeSend(objectRejection(), {} as never)).not.toBeNull();
  });

  it('keeps a rejection with a stacktrace on Edge iOS', () => {
    withUserAgent(EDGE_IOS_UA);
    const event = objectRejection();
    event.exception!.values![0].stacktrace = { frames: [{ function: 'confirm' }] };
    expect(beforeSend(event, {} as never)).not.toBeNull();
  });
});
