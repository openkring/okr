import { describe, it, expect } from 'vitest';
import { parseSelftestStatus, withSelftest } from './selftest-status';
import type { WebhookSelftestResult } from '../_webhooks/selftest';

const NOW = Date.parse('2026-11-07T12:00:00Z');
const at = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const doc = (over: Partial<WebhookSelftestResult> = {}): WebhookSelftestResult => ({
  level: 'ok', checkedAt: at(1), trigger: 'nightly', durationMs: 900,
  days: [{ date: '2026-11-06', level: 'down' }, { date: '2026-11-07', level: 'ok' }], ...over,
});

describe('parseSelftestStatus', () => {
  it('ok when checked 1 h ago, with the day strip', () => {
    expect(parseSelftestStatus(doc(), NOW)).toEqual({
      level: 'ok',
      history: [{ day: '2026-11-06', status: 'downtime' }, { day: '2026-11-07', status: 'operational' }],
    });
  });
  it('down when the last run failed', () => {
    expect(parseSelftestStatus(doc({ level: 'down' }), NOW).level).toBe('down');
  });
  it('unknown when the last run is older than 36 h', () => {
    expect(parseSelftestStatus(doc({ checkedAt: at(37) }), NOW).level).toBe('unknown');
  });
  it('unknown without a document', () => {
    expect(parseSelftestStatus(undefined, NOW)).toEqual({ level: 'unknown' });
  });
});

describe('withSelftest', () => {
  it('adds the receiver row without touching the provider rows', () => {
    const out = withSelftest({ checkedAt: 'x', services: { apple: { parts: {} } } }, doc(), NOW);
    expect(out.services['apple']).toEqual({ parts: {} });
    expect(out.services['webhook-receiver'].parts['Selbsttest'].level).toBe('ok');
  });
});
