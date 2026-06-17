import type { HttpInterceptorFn } from '@angular/common/http';
import { addBreadcrumb, setTag, setUser } from '@sentry/angular';
import type { BrowserOptions, ErrorEvent, EventHint } from '@sentry/angular';
import { redactSensitive, stripPii } from '@bk2/shared-util-core';
import { catchError } from 'rxjs';

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
