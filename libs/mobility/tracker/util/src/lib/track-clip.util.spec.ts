import { describe, it, expect } from 'vitest';
import { CREW_TRACK_MARGIN_MS } from '@okr/shared-models';
import { clipSections, logbuchWindowMs, zurichWallClockMs } from './track-clip.util';
import type { LocalSection } from './track-sections.util';

describe('zurichWallClockMs', () => {
  it('summer time: 20261024 09:30 is 07:30 UTC', () =>
    expect(zurichWallClockMs('20261024', '09:30')).toBe(Date.UTC(2026, 9, 24, 7, 30)));
  it('winter time after the switch: 20261026 09:30 is 08:30 UTC', () =>
    expect(zurichWallClockMs('20261026', '09:30')).toBe(Date.UTC(2026, 9, 26, 8, 30)));
});

describe('logbuchWindowMs', () => {
  const trip = { startDate: '20261024', startTime: '09:30', endDate: '20261024', endTime: '11:00' };
  it('window adds the 5 min margin', () => {
    const w = logbuchWindowMs(trip, 0);
    expect(w.fromMs).toBe(Date.UTC(2026, 9, 24, 7, 30) - CREW_TRACK_MARGIN_MS);
    expect(w.toMs).toBe(Date.UTC(2026, 9, 24, 9, 0) + CREW_TRACK_MARGIN_MS);
  });
  it('accepts legacy HHmm times', () => {
    const w = logbuchWindowMs({ ...trip, startTime: '0930', endTime: '1100' }, 0);
    expect(w.fromMs).toBe(Date.UTC(2026, 9, 24, 7, 30) - CREW_TRACK_MARGIN_MS);
    expect(w.toMs).toBe(Date.UTC(2026, 9, 24, 9, 0) + CREW_TRACK_MARGIN_MS);
  });
  it('open trip ends at the recording end', () =>
    expect(logbuchWindowMs({ ...trip, endDate: '', endTime: '' }, 12345).toMs).toBe(12345));
});

describe('clipSections', () => {
  const pt = (t: number) => ({ lat: 47, lng: 8, t });
  const row = (): LocalSection => ({
    mode: 'row' as LocalSection['mode'],
    detected: true,
    points: [0, 10, 20, 30, 40].map(pt),
    strokeTimes: [5, 15, 25],
    steps: 3,
  });
  it('clip drops points and strokes outside', () => {
    const [s] = clipSections([row()], 10, 30);
    expect(s.points.map((p) => p.t)).toEqual([10, 20, 30]);
    expect(s.strokeTimes).toEqual([15, 25]);
  });
  it('keeps a fully inside section untouched', () => {
    const [s] = clipSections([row()], -1, 100);
    expect(s).toEqual(row());
  });
  it('clip drops a section left with < 2 points', () => {
    expect(clipSections([row()], 35, 100)).toEqual([]);
  });
});
