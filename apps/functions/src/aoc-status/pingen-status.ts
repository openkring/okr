// apps/functions/src/aoc-status/pingen-status.ts
//
// The Pingen row of the AOC status page (spec 1.150 §10). Three parts, each a pure reduction of data
// the caller already read: the organisation's balance, the newest real Pingen webhook, and the receiver
// probe of the self-test. The caller reads them fail-soft; nothing here throws.
import {
  PINGEN_PART_BALANCE, PINGEN_PART_LAST_WEBHOOK, PINGEN_PART_SELFTEST, PINGEN_SERVICE_ID,
  type PartStatus, type ServiceStatusResult,
} from '@okr/aoc-util';
import type { WebhookSelftestResult } from '../_webhooks/selftest';
import { PINGEN_PROBE_PREFIX } from '../_webhooks/selftest';
import { SELFTEST_STALE_MS } from './selftest-status';

/** Below this balance (CHF) the row warns: letters of all tenants are paid from one prepaid account. */
export const PINGEN_LOW_BALANCE_CHF = 200;

/** What `readOrganisation()` gives, or the code of why it failed (a PingenError status, 0 = network). */
export type PingenOrganisationRead = { billingBalance: number; missingCredits: number; currency: string } | { error: string };

const chf = (value: number): string => `${value.toFixed(2)} CHF`;

export function parsePingenBalance(read: PingenOrganisationRead | undefined): PartStatus {
  if (!read) return { level: 'unknown' };
  if ('error' in read) return { level: 'unknown', detail: `Fehler ${read.error}`.slice(0, 40) };
  const { billingBalance, missingCredits, currency } = read;
  if (!Number.isFinite(billingBalance) || !Number.isFinite(missingCredits)) return { level: 'unknown' };
  // Pingen holds letters it cannot pay for; that is an outage for the sender, not a warning.
  if (missingCredits > 0) return { level: 'down', detail: `fehlend ${missingCredits.toFixed(2)} ${currency}` };
  // Only a CHF balance can be compared with the CHF threshold.
  if (currency !== 'CHF') return { level: 'unknown', detail: `${billingBalance.toFixed(2)} ${currency}` };
  return { level: billingBalance < PINGEN_LOW_BALANCE_CHF ? 'degraded' : 'ok', detail: chf(billingBalance) };
}

/** No webhook is not a fault (no letters sent lately), so the part is `unknown`, never `down`. */
export function parsePingenLastWebhook(receivedAtMs: number | undefined): PartStatus {
  if (receivedAtMs === undefined || !Number.isFinite(receivedAtMs)) return { level: 'unknown' };
  return { level: 'ok', detail: new Date(receivedAtMs).toLocaleDateString('de-CH', { timeZone: 'Europe/Zurich' }) };
}

export function parsePingenSelftest(doc: WebhookSelftestResult | undefined, nowMs: number): PartStatus {
  const probe = doc?.pingen;
  if (!probe) return { level: 'unknown' };
  if (nowMs - Date.parse(probe.checkedAt) > SELFTEST_STALE_MS) return { level: 'unknown' };
  return { level: probe.level };
}

export interface PingenStatusInput {
  organisation: PingenOrganisationRead | undefined;
  lastWebhookMs: number | undefined;
  selftest: WebhookSelftestResult | undefined;
  nowMs: number;
}

/**
 * Newest event that Pingen really sent: the self-test posts its own signed probes to the same receiver
 * (client 'pingen'), recognisable by their letter id, and they must not pass for traffic.
 */
export function newestRealWebhookMs(rows: { receivedAtMs: number; payload: unknown }[]): number | undefined {
  const real = rows.filter(r => {
    const id = (r.payload as { data?: { id?: unknown } } | null)?.data?.id;
    return !(typeof id === 'string' && id.startsWith(PINGEN_PROBE_PREFIX));
  });
  return real.length ? Math.max(...real.map(r => r.receivedAtMs)) : undefined;
}

export function withPingen(result: ServiceStatusResult, input: PingenStatusInput): ServiceStatusResult {
  return {
    ...result,
    services: {
      ...result.services,
      [PINGEN_SERVICE_ID]: {
        parts: {
          [PINGEN_PART_BALANCE]: parsePingenBalance(input.organisation),
          [PINGEN_PART_LAST_WEBHOOK]: parsePingenLastWebhook(input.lastWebhookMs),
          [PINGEN_PART_SELFTEST]: parsePingenSelftest(input.selftest, input.nowMs),
        },
      },
    },
  };
}
