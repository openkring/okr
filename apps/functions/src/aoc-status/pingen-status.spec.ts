import { describe, it, expect } from 'vitest';
import { newestRealWebhookMs, parsePingenBalance, parsePingenLastWebhook, parsePingenSelftest, withPingen, PINGEN_LOW_BALANCE_CHF } from './pingen-status';
import type { WebhookSelftestResult } from '../_webhooks/selftest';

const NOW = Date.parse('2026-11-09T12:00:00Z');
const org = (billingBalance: number, missingCredits = 0, currency = 'CHF') => ({ billingBalance, missingCredits, currency });
const selftest = (pingen?: WebhookSelftestResult['pingen']): WebhookSelftestResult => ({
  level: 'ok', checkedAt: new Date(NOW).toISOString(), trigger: 'nightly', durationMs: 1, days: [], pingen,
});

describe('parsePingenBalance', () => {
  it('ok at or above the threshold', () => {
    expect(parsePingenBalance(org(PINGEN_LOW_BALANCE_CHF))).toEqual({ level: 'ok', detail: '200.00 CHF' });
    expect(parsePingenBalance(org(1234.5)).level).toBe('ok');
  });
  it('warns below CHF 200', () => {
    expect(parsePingenBalance(org(199.99))).toEqual({ level: 'degraded', detail: '199.99 CHF' });
  });
  it('is an error when credit is missing, however high the balance', () => {
    expect(parsePingenBalance(org(500, 12.5)).level).toBe('down');
  });
  it('is unknown with the code when the call failed', () => {
    expect(parsePingenBalance({ error: '401' })).toEqual({ level: 'unknown', detail: 'Fehler 401' });
  });
  it('is unknown without a read, on non-numbers and on a foreign currency', () => {
    expect(parsePingenBalance(undefined).level).toBe('unknown');
    expect(parsePingenBalance(org(NaN)).level).toBe('unknown');
    expect(parsePingenBalance(org(900, 0, 'EUR')).level).toBe('unknown');
  });
});

describe('parsePingenLastWebhook', () => {
  it('ok with the date', () => {
    expect(parsePingenLastWebhook(NOW)).toEqual({ level: 'ok', detail: '9.11.2026' });
  });
  it('unknown when none was received', () => {
    expect(parsePingenLastWebhook(undefined)).toEqual({ level: 'unknown' });
  });
});

describe('parsePingenSelftest', () => {
  it('follows the probe', () => {
    expect(parsePingenSelftest(selftest({ level: 'ok', checkedAt: new Date(NOW).toISOString() }), NOW).level).toBe('ok');
    expect(parsePingenSelftest(selftest({ level: 'down', checkedAt: new Date(NOW).toISOString() }), NOW).level).toBe('down');
  });
  it('unknown when old, absent or the result predates the probe', () => {
    expect(parsePingenSelftest(selftest({ level: 'ok', checkedAt: new Date(NOW - 40 * 3_600_000).toISOString() }), NOW).level).toBe('unknown');
    expect(parsePingenSelftest(selftest(), NOW).level).toBe('unknown');
    expect(parsePingenSelftest(undefined, NOW).level).toBe('unknown');
  });
});

describe('withPingen', () => {
  it('adds the pingen row and keeps the others', () => {
    const out = withPingen({ checkedAt: 'x', services: { apple: { parts: {} } } }, { organisation: org(300), lastWebhookMs: NOW, selftest: undefined, nowMs: NOW });
    expect(out.services['apple']).toEqual({ parts: {} });
    expect(Object.keys(out.services['pingen'].parts)).toEqual(['Guthaben', 'Letzter Webhook', 'Webhook-Selbsttest']);
    expect(out.services['pingen'].parts['Guthaben'].level).toBe('ok');
  });
});

describe('newestRealWebhookMs', () => {
  const real = (ms: number) => ({ receivedAtMs: ms, payload: { data: { id: 'ev_1' } } });
  const probe = (ms: number) => ({ receivedAtMs: ms, payload: { data: { id: 'selftest-abc' } } });
  it('takes the newest event', () => {
    expect(newestRealWebhookMs([real(1), real(5), real(3)])).toBe(5);
  });
  it('skips the self-test probes, however new', () => {
    expect(newestRealWebhookMs([probe(9), real(2)])).toBe(2);
    expect(newestRealWebhookMs([probe(9)])).toBeUndefined();
  });
  it('is undefined without rows and survives odd payloads', () => {
    expect(newestRealWebhookMs([])).toBeUndefined();
    expect(newestRealWebhookMs([{ receivedAtMs: 4, payload: null }])).toBe(4);
  });
});
