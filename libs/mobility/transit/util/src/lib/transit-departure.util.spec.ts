import { describe, expect, it } from 'vitest';

import type { TransitDeparture, TransitSituation } from './transit-departure.model';
import { delayMinutes, departuresStale, minutesUntil, shownSituations, visibleDepartures, walkMinutes } from './transit-departure.util';

const NOW = Date.parse('2026-10-31T14:32:00Z');

function dep(plannedAt: string, estimatedAt = '', cancelled = false, line = 'S7'): TransitDeparture {
  return { line, mode: 'train', destination: 'Rapperswil', quay: '2', plannedAt, estimatedAt, cancelled, situationIds: [] };
}

describe('walkMinutes', () => {
  it('rounds the distance at 80 m a minute', () => {
    expect(walkMinutes(450)).toBe(6);
    expect(walkMinutes(30)).toBe(0);
    expect(walkMinutes(undefined)).toBe(0);
    expect(walkMinutes(-5)).toBe(0);
  });
});

describe('delayMinutes / minutesUntil', () => {
  it('is the realtime difference, 0 without realtime', () => {
    expect(delayMinutes(dep('2026-10-31T14:44:00Z', '2026-10-31T14:47:10Z'))).toBe(3);
    expect(delayMinutes(dep('2026-10-31T14:44:00Z'))).toBe(0);
  });

  it('counts down to the estimate and never below zero', () => {
    expect(minutesUntil(dep('2026-10-31T14:36:00Z'), NOW)).toBe(4);
    expect(minutesUntil(dep('2026-10-31T14:36:00Z', '2026-10-31T14:40:00Z'), NOW)).toBe(8);
    expect(minutesUntil(dep('2026-10-31T14:30:00Z'), NOW)).toBe(0);
  });
});

describe('visibleDepartures', () => {
  const all = [
    dep('2026-10-31T14:30:00Z', '2026-10-31T14:41:00Z', false, 'late'), // delayed, leaves 14:41
    dep('2026-10-31T14:34:00Z', '', false, 'gone'),                     // within the walk
    dep('2026-10-31T14:39:00Z', '', true, 'cancelled'),                 // cancelled, kept by its timetable
    dep('2026-10-31T14:51:00Z', '', false, 'later'),
  ];

  it('hides what you cannot reach on foot and orders by actual departure', () => {
    expect(visibleDepartures(all, NOW, 5, 10).map((d) => d.line)).toEqual(['cancelled', 'late', 'later']);
  });

  it('cuts to the limit', () => {
    expect(visibleDepartures(all, NOW, 0, 2).map((d) => d.line)).toEqual(['gone', 'cancelled']);
  });
});

describe('departuresStale', () => {
  it('is stale after five minutes or without a time', () => {
    expect(departuresStale('2026-10-31T14:28:00Z', NOW)).toBe(false);
    expect(departuresStale('2026-10-31T14:26:00Z', NOW)).toBe(true);
    expect(departuresStale('', NOW)).toBe(true);
  });
});

describe('shownSituations', () => {
  const s = (id: string, active: boolean): TransitSituation => ({ id, summary: id, detail: '', priority: 3, active, planned: true });

  it('shows the situations in force, announced ones only on request', () => {
    expect(shownSituations([s('a', true), s('b', false)], false).map((x) => x.id)).toEqual(['a']);
    expect(shownSituations([s('a', true), s('b', false)], true).map((x) => x.id)).toEqual(['a', 'b']);
  });
});
