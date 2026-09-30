import { describe, expect, it } from 'vitest';

import { toStoreDate, toStoreDateTime } from './zurich-time';

describe('toStoreDate — pinned to Europe/Zurich, not the host clock', () => {
  it('zero-pads month and day', () => {
    expect(toStoreDate(new Date(Date.UTC(2026, 0, 5, 12, 0)))).toBe('20260105');
  });

  it('uses Zurich, not UTC: 22:31 UTC in summer is already the next day', () => {
    // The bug this pins: the deployed container runs in UTC, so Date's local getters gave the
    // UTC date. `onSchedule({ timeZone })` only schedules the run, it does not set the zone.
    expect(toStoreDate(new Date('2026-08-30T22:31:51Z'))).toBe('20260831');
  });

  it('handles the winter offset too (CET, +1)', () => {
    expect(toStoreDate(new Date('2026-01-15T23:30:00Z'))).toBe('20260116');
    expect(toStoreDate(new Date('2026-01-15T22:30:00Z'))).toBe('20260115');
  });

  it('maps a UTC instant late in the evening to the next Zurich day', () => {
    // 22:30 UTC on 2026-09-30 is already 00:30 on 2026-10-01 in Zurich (CEST, +2) — the exact
    // window where a bare `new Date()`/`getTodayStr` would read yesterday's date.
    expect(toStoreDate(new Date('2026-09-30T22:30:00Z'))).toBe('20261001');
  });
});

describe('toStoreDateTime', () => {
  it('stamps the Zurich wall clock, not UTC', () => {
    expect(toStoreDateTime(new Date('2026-08-30T22:31:51Z'))).toBe('20260831003151');
  });

  it('zero-pads every component', () => {
    expect(toStoreDateTime(new Date('2026-01-05T07:08:09Z'))).toBe('20260105080809');
  });

  it('maps a UTC instant late in the evening to the next Zurich day', () => {
    expect(toStoreDateTime(new Date('2026-09-30T22:30:00Z'))).toBe('20261001003000');
  });
});
