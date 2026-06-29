import * as Sentry from '@sentry/angular';
import { buildSentryOptions } from '@bk2/shared-util-angular';
import { environment } from './environments/environment';

// Initialize Sentry before anything else. No-op when no sentry config / DSN is present
// (e.g. local dev), so the app always boots even without monitoring.
if (environment.sentry?.dsn) {
  Sentry.init(
    buildSentryOptions(environment.sentry, [Sentry.browserTracingIntegration()]),
  );
}
