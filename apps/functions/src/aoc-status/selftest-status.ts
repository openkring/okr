// apps/functions/src/aoc-status/selftest-status.ts
//
// The `internal` source (spec 1.143): the webhook receiver row reads our own self-test result
// instead of a provider feed. Read on every call, after the feed cache, so a fresh test shows at
// once and a missed nightly run turns the row grey.
import { PartStatus, ServiceStatusResult, WEBHOOK_RECEIVER_PART, WEBHOOK_RECEIVER_SERVICE_ID } from '@okr/aoc-util';
import type { WebhookSelftestResult } from '../_webhooks/selftest';

/** A nightly run plus a margin: older than this, the test has stopped running. */
export const SELFTEST_STALE_MS = 36 * 3_600_000;

export function parseSelftestStatus(doc: WebhookSelftestResult | undefined, nowMs: number): PartStatus {
  if (!doc) return { level: 'unknown' };
  const stale = nowMs - Date.parse(doc.checkedAt) > SELFTEST_STALE_MS;
  const history = (doc.days ?? []).map(d => ({ day: d.date, status: d.level === 'ok' ? 'operational' : 'downtime' }));
  return { level: stale ? 'unknown' : doc.level, ...(history.length ? { history } : {}) };
}

export function withSelftest(result: ServiceStatusResult, doc: WebhookSelftestResult | undefined, nowMs: number): ServiceStatusResult {
  return {
    ...result,
    services: { ...result.services, [WEBHOOK_RECEIVER_SERVICE_ID]: { parts: { [WEBHOOK_RECEIVER_PART]: parseSelftestStatus(doc, nowMs) } } },
  };
}
