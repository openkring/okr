import { describe, expect, it } from 'vitest';
import { mergeWithNext, setSectionMode, splitSection, splitStepsByDistance, toTrackSections } from './track-sections.util';
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

describe('steps through corrections (spec 1.122)', () => {
  const withSteps = (x: LocalSection, steps: number): LocalSection => ({ ...x, steps });

  it('drops steps when the mode changes away from foot', () => {
    const r = setSectionMode([withSteps(sec('foot', 5), 500)], 0, 'car');
    expect('steps' in r[0]).toBe(false);
  });
  it('sums steps when a mode change merges foot neighbours', () => {
    const r = setSectionMode([withSteps(sec('foot', 5), 100), sec('car', 5, 47.004), withSteps(sec('foot', 5, 47.008), 200)], 1, 'foot');
    expect(r).toHaveLength(1);
    expect(r[0].steps).toBe(300);
  });
  it('sums steps when merging two foot sections', () => {
    const r = mergeWithNext([withSteps(sec('foot', 5), 100), withSteps(sec('foot', 5, 47.004), 200)], 0);
    expect(r[0].steps).toBe(300);
  });
  it('keeps the present count when a longer foot section absorbs a car section', () => {
    const r = mergeWithNext([withSteps(sec('foot', 10), 300), sec('car', 3, 47.009)], 0);
    expect(r[0].mode).toBe('foot');
    expect(r[0].steps).toBe(300);
  });
  it('has no steps when neither merged section had any', () => {
    const r = mergeWithNext([sec('foot', 5), sec('foot', 5, 47.004)], 0);
    expect('steps' in r[0]).toBe(false);
  });
  it('gives the head of a split foot section its distance share; the non-foot tail gets none', () => {
    const r = splitSection([withSteps(sec('foot', 11), 1000)], 0, 3, 'bus');
    expect(r[0].steps).toBe(300);
    expect('steps' in r[1]).toBe(false);
  });
});

describe('splitStepsByDistance', () => {
  it('splits by distance', () => expect(splitStepsByDistance(1000, 300, 700)).toEqual([300, 700]));
  it('preserves the sum when rounding', () => {
    const [a, b] = splitStepsByDistance(1001, 1, 2);
    expect((a ?? 0) + (b ?? 0)).toBe(1001);
  });
  it('keeps unknown steps unknown', () => expect(splitStepsByDistance(undefined, 1, 2)).toEqual([undefined, undefined]));
  it('puts all steps on the head when there is no distance', () => expect(splitStepsByDistance(500, 0, 0)).toEqual([500, 0]));
});

describe('toTrackSections figures (spec 1.122)', () => {
  it('writes steps for foot and no split fields', () => {
    const [t] = toTrackSections([{ ...sec('foot', 5), steps: 640 }], 'k');
    expect(t.steps).toBe(640);
    expect('splitAvgS' in t).toBe(false);
  });
  it('writes the splits for row', () => {
    const [t] = toTrackSections([sec('row', 10)], 'k');
    expect(t.splitAvgS).toBeGreaterThan(0);
    expect(t.splitBestS).toBeGreaterThan(0);
    expect('steps' in t).toBe(false);
  });
  it('writes no figure keys for a legacy section', () => {
    const [t] = toTrackSections([sec('foot', 5)], 'k');
    expect('steps' in t).toBe(false);
    expect('splitAvgS' in t).toBe(false);
  });
});

describe('stroke times through corrections (spec 1.122 2c)', () => {
  const row = (n: number, startLat = 47): LocalSection => {
    const x = sec('row', n, startLat);
    return { ...x, strokeTimes: x.points.slice(1).map((p) => p.t - 1000) };
  };
  it('partitions the stroke times at the split point', () => {
    const r = splitSection([row(11)], 0, 4, 'foot');
    expect(r[0].strokeTimes).toEqual(row(11).strokeTimes?.slice(0, 4));
    expect('strokeTimes' in r[1]).toBe(false);
  });
  it('concatenates the stroke times when two row sections merge', () => {
    const a = row(5);
    const b = row(5, 47.004);
    const r = mergeWithNext([a, b], 0);
    expect(r[0].strokeTimes).toEqual([...(a.strokeTimes ?? []), ...(b.strokeTimes ?? [])]);
  });
  it('drops the stroke times when the merged mode is not row', () => {
    const r = mergeWithNext([row(3), sec('car', 10, 47.003)], 0);
    expect(r[0].mode).toBe('car');
    expect('strokeTimes' in r[0]).toBe(false);
  });
  it('drops the stroke times on a mode change away from row', () => {
    expect('strokeTimes' in setSectionMode([row(5)], 0, 'ship')[0]).toBe(false);
  });
  it('writes the stroke figures of a row section with times, none without', () => {
    const [withTimes] = toTrackSections([row(11)], 'k');
    expect(withTimes.strokes).toBe(10);
    expect(withTimes.strokeRateAvg).toBe(6);
    const [without] = toTrackSections([sec('row', 11)], 'k');
    expect('strokes' in without).toBe(false);
  });
});
