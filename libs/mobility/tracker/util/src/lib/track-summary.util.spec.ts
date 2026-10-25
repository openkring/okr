import { describe, expect, it } from 'vitest';
import { distanceM, summarize } from './track-summary.util';

describe('track summary', () => {
  it('summarizes two points', () => {
    const s = summarize([
      { lat: 47, lng: 8, t: 0 },
      { lat: 47.001, lng: 8, t: 60_000 },
    ]);
    expect(Math.abs(s.distanceM - 111)).toBeLessThanOrEqual(1);
    expect(s.durationS).toBe(60);
  });
  it('empty and single', () => {
    expect(summarize([])).toEqual({ distanceM: 0, durationS: 0 });
    expect(summarize([{ lat: 1, lng: 1, t: 5 }])).toEqual({ distanceM: 0, durationS: 0 });
  });
  it('distanceM zero for same point', () => expect(distanceM({ lat: 1, lng: 2 }, { lat: 1, lng: 2 })).toBe(0));
});
