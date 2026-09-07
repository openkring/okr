import * as logger from 'firebase-functions/logger';

/**
 * Minimal, dependency-free Sentry reporter for Cloud Functions.
 *
 * Why not `@sentry/node`: the only thing the backend needs is "file this one error", and the SDK
 * would add a dependency plus an instrumentation layer to a bundle that is already 3.9 MB. This
 * posts a single envelope over `fetch` — the same wire format the SDK uses.
 *
 * Its reason to exist is the class of failure that is deliberately INVISIBLE to the caller: the
 * password-reset path swallows every error and answers `{success: true}` so it cannot be used as an
 * account-enumeration oracle (M-3). That is right for the client and wrong for the operator — a
 * misconfigured tenant then looks exactly like a healthy one. Report those here.
 *
 * No-ops (and says so once, at debug level) when `SENTRY_FUNCTIONS_DSN` is unset or unparseable, so
 * an unconfigured environment and the emulator stay silent instead of throwing.
 */

interface SentryReport {
  /** Grouping title — keep it stable and free of ids, or every tenant becomes its own issue. */
  message: string;
  /** Searchable dimensions, e.g. `{ appId, code }`. Never put PII (recipients, names) in here. */
  tags?: Record<string, string>;
  /** Extra context attached to the event but not indexed. */
  extra?: Record<string, unknown>;
  level?: 'error' | 'warning' | 'info';
}

interface ParsedDsn {
  envelopeUrl: string;
  publicKey: string;
}

function parseDsn(dsn: string): ParsedDsn | undefined {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    if (!url.username || !projectId) return undefined;
    return {
      envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
      publicKey: url.username,
    };
  } catch {
    return undefined;
  }
}

/**
 * Fire-and-forget: never rejects and never throws, so a reporting outage can never turn into a
 * failure of the operation being reported. Await it when you can (Cloud Functions freezes the
 * instance after the handler returns, which would drop an unawaited request).
 */
export async function reportToSentry(report: SentryReport): Promise<void> {
  // The secret is provisioned with the placeholder 'unset' so the function can be deployed before
  // the Sentry project exists — anything that is not a URL means "not configured yet".
  const dsn = process.env['SENTRY_FUNCTIONS_DSN'];
  if (!dsn || !dsn.startsWith('http')) return;

  const parsed = parseDsn(dsn);
  if (!parsed) {
    logger.debug('reportToSentry: SENTRY_FUNCTIONS_DSN is set but unparseable — skipping');
    return;
  }

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const sentAt = new Date().toISOString();

  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: report.level ?? 'error',
    logger: 'cloud-functions',
    environment: process.env['NODE_ENV'] === 'production' ? 'production' : 'development',
    server_name: process.env['K_SERVICE'] ?? 'functions',
    message: { formatted: report.message },
    tags: { function: process.env['K_SERVICE'] ?? 'unknown', ...report.tags },
    ...(report.extra ? { extra: report.extra } : {}),
  };

  const envelope =
    JSON.stringify({ event_id: eventId, sent_at: sentAt }) + '\n' +
    JSON.stringify({ type: 'event' }) + '\n' +
    JSON.stringify(event) + '\n';

  try {
    const response = await fetch(`${parsed.envelopeUrl}?sentry_key=${parsed.publicKey}&sentry_version=7`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
    });
    if (!response.ok) {
      logger.debug(`reportToSentry: Sentry rejected the envelope (${response.status})`);
    }
  } catch (e: unknown) {
    // Swallow: the caller is already handling a failure, and a second one helps nobody.
    logger.debug('reportToSentry: could not reach Sentry', { error: String(e) });
  }
}
