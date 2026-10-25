import { describe, expect, it } from 'vitest';
import { mergeWithNext, setSectionMode, splitSection, toTrackSections } from './track-sections.util';
import type { LocalSection } from './track-sections.util';
import type { TrackPoint } from './track-polyline.util';

const pts = (n: number, startLat = 47, t0 = 1_760_000_000_000, stepLat = 0.001): TrackPoint[] =>
  Array.from({ length: n }, (_, i) => ({ lat: startLat + i * stepLat, lng: 8, t: t0 + i * 10_000 }));

const sec = (mode: LocalSection['mode'], n: number, startLat = 47, stepLat = 0.001): LocalSection => ({
  mode,
  detected: true,
  points: pts(n, startLat, 1_760_000_000_000, stepLat),
});

describe('splitSection', () => {
  it('splits at point 5 of 10 into 6 and 5 points sharing the split point', () => {
    const r = splitSection([sec('car', 10)], 0, 5, 'foot');
    expect(r).toHaveLength(2);
    expect(r[0].points).toHaveLength(6);
    expect(r[1].points).toHaveLength(5);
    expect(r[0].points[5]).toEqual(r[1].points[0]);
    expect(r[0].mode).toBe('car');
    expect(r[1].mode).toBe('foot');
    expect(r[1].detected).toBe(false);
  });
  it('same mode is a no-op', () => {
    const s = [sec('car', 10)];
    expect(splitSection(s, 0, 5, 'car')).toBe(s);
  });
  it('out of range returns input', () => {
    const s = [sec('car', 10)];
    expect(splitSection(s, 3, 5, 'foot')).toBe(s);
    expect(splitSection(s, 0, 0, 'foot')).toBe(s);
    expect(splitSection(s, 0, 9, 'foot')).toBe(s);
    expect(splitSection(s, 0, 10, 'foot')).toBe(s);
  });
});

describe('setSectionMode', () => {
  it('sets mode and detected=false', () => {
    const r = setSectionMode([sec('car', 3), sec('foot', 3)], 1, 'bike');
    expect(r[1].mode).toBe('bike');
    expect(r[1].detected).toBe(false);
  });
  it('merges with an equal-mode neighbour', () => {
    const r = setSectionMode([sec('foot', 4), sec('car', 4)], 1, 'foot');
    expect(r).toHaveLength(1);
    expect(r[0].mode).toBe('foot');
  });
  it('out of range returns input', () => {
    const s = [sec('car', 3)];
    expect(setSectionMode(s, 5, 'foot')).toBe(s);
    expect(setSectionMode(s, -1, 'foot')).toBe(s);
  });
});

describe('mergeWithNext', () => {
  it('keeps the mode of the longer section (by distance)', () => {
    const a = sec('foot', 3, 47, 0.001);
    const b = sec('car', 3, 47.01, 0.01);
    const r = mergeWithNext([a, b], 0);
    expect(r).toHaveLength(1);
    expect(r[0].mode).toBe('car');
  });
  it('does not duplicate a shared boundary point', () => {
    const a = sec('foot', 3);
    const b: LocalSection = { mode: 'car', detected: true, points: [a.points[2], ...pts(2, 47.01, 1_760_000_100_000)] };
    expect(mergeWithNext([a, b], 0)[0].points).toHaveLength(5);
  });
  it('out of range returns input', () => {
    const s = [sec('car', 3)];
    expect(mergeWithNext(s, 0)).toBe(s);
    expect(mergeWithNext(s, 4)).toBe(s);
  });
});

describe('toTrackSections', () => {
  it('fills the fields', () => {
    const r = toTrackSections([sec('car', 3), { ...sec('foot', 2, 47.1), detected: false }], 'trip1');
    expect(r).toHaveLength(2);
    expect(r[0].mode).toBe('car');
    expect(r[0].detected).toBe(true);
    expect(r[0].distanceM).toBeGreaterThan(200);
    expect(r[0].startedAt).toBe(new Date(1_760_000_000_000).toISOString());
    expect(r[0].endedAt).toBe(new Date(1_760_000_020_000).toISOString());
    expect(r[0].pointsPath).toBe('trips/trip1/track-points/0');
    expect(r[1].pointsPath).toBe('trips/trip1/track-points/1');
    expect(r[1].detected).toBe(false);
  });
});
