import { describe, expect, it } from 'vitest';
import { dropGpsSpikes, findSpikeRuns, pickIndices, spikeFreeIndices, spikeRunAround } from './track-spikes.util';
import type { TrackPoint } from './track-polyline.util';
import { summarize } from './track-summary.util';

const T0 = 1_760_000_000_000;
/** about 11 m per 0.0001° of latitude; 0.0001° of longitude is about 7.6 m at 47° */
const at = (dLat: number, dLng: number, s: number): TrackPoint => ({ lat: 47 + dLat, lng: 8 + dLng, t: T0 + s * 1000 });

/** a walk north, 11 m every 10 s (1.1 m/s) */
const walk = (n: number, fromS = 0, fromLat = 0): TrackPoint[] => Array.from({ length: n }, (_, i) => at(fromLat + i * 0.0001, 0, fromS + i * 10));

/**
 * The pattern of 30.10.2026: a pause at a viewpoint, then four fixes swinging about 1 km to the side and back
 * within 30 seconds, then the walk goes on from where it paused.
 */
function viewpointSpike(): TrackPoint[] {
  const before = walk(10); // 0 … 90 s, last at lat +0.0009
  const pauseEnd = at(0.0009, 0.00001, 400); // 5 minutes later, the same spot
  const spike = [
    at(0.0009 - 0.0035, 0.0055, 530), // ~575 m away after 130 s
    at(0.0009 - 0.0021, 0.0089, 539),
    at(0.0009 - 0.0016, 0.0100, 553),
    at(0.0009 - 0.0020, 0.0019, 561), // 620 m back in 8 s
  ];
  const after = walk(10, 585, 0.0009);
  return [...before, pauseEnd, ...spike, ...after];
}

describe('findSpikeRuns', () => {
  it('finds the four-point detour of 30.10.2026', () => {
    const points = viewpointSpike();
    expect(findSpikeRuns(points, 'foot')).toEqual([{ start: 11, end: 14 }]);
  });

  it('finds a single bad fix', () => {
    const points = walk(10);
    points[5] = at(0.0005, 0.004, 50); // 300 m to the side for one fix
    expect(findSpikeRuns(points, 'foot')).toEqual([{ start: 5, end: 5 }]);
  });

  it('keeps a real out-and-back walk: no leg is too fast', () => {
    // 300 m east and back again at walking speed
    const out = Array.from({ length: 30 }, (_, i) => at(0, i * 0.00014, i * 10));
    const back = Array.from({ length: 30 }, (_, i) => at(0, (29 - i) * 0.00014, 300 + i * 10));
    expect(findSpikeRuns([...out, ...back], 'foot')).toEqual([]);
  });

  it('keeps a fast but straight stretch: it does not come back', () => {
    const points = walk(10);
    for (let i = 5; i < 10; i++) points[i] = at(0.0005 + (i - 5) * 0.01, 0, i * 10);
    expect(findSpikeRuns(points, 'foot')).toEqual([]);
  });

  it('allows more speed for a train than on foot', () => {
    const points = walk(10);
    points[5] = at(0.0005, 0.004, 50);
    points[4] = at(0.0004, 0, 49); // 300 m in 1 s: too fast even for a train
    expect(findSpikeRuns(points, 'train')).toEqual([{ start: 5, end: 5 }]);
    const slow = walk(10).map((p, i) => ({ ...p, t: T0 + i * 60_000 }));
    slow[5] = { ...at(0.0005, 0.004, 0), t: T0 + 5 * 60_000 }; // 300 m in a minute: 5 m/s, fine for a train
    expect(findSpikeRuns(slow, 'train')).toEqual([]);
  });

  it('never filters a plane, never touches the first or last point', () => {
    const points = walk(10);
    points[5] = at(0.0005, 0.004, 50);
    expect(findSpikeRuns(points, 'plane')).toEqual([]);
    const ends = walk(5);
    ends[0] = at(0, 0.01, 0); // a bad first fix has no point before it: it stays
    expect(findSpikeRuns(ends, 'foot')).toEqual([]);
  });
});

describe('dropGpsSpikes', () => {
  it('drops the detour and shortens the distance', () => {
    const points = viewpointSpike();
    const clean = dropGpsSpikes(points, 'foot');
    expect(clean).toHaveLength(points.length - 4);
    expect(summarize(clean).distanceM).toBeLessThan(300);
    expect(summarize(points).distanceM).toBeGreaterThan(2000);
  });

  it('returns the same array when there is nothing to drop', () => {
    const points = walk(10);
    expect(dropGpsSpikes(points, 'foot')).toBe(points);
  });
});

describe('spikeFreeIndices / pickIndices', () => {
  it('keeps a parallel array in step with the points', () => {
    const points = viewpointSpike();
    const keep = spikeFreeIndices(points, 'foot');
    const heights = points.map((_, i) => i);
    expect(pickIndices(heights, keep)).toEqual(heights.filter((i) => i < 11 || i > 14));
    expect(pickIndices(undefined, keep)).toBeUndefined();
  });
});

describe('spikeRunAround', () => {
  it('finds the whole detour from any of its points', () => {
    const points = viewpointSpike();
    for (const k of [11, 12, 13, 14]) expect(spikeRunAround(points, k)).toEqual({ start: 11, end: 14 });
  });

  it('finds nothing on a plain walk or at the ends', () => {
    const points = walk(10);
    expect(spikeRunAround(points, 5)).toBeUndefined();
    expect(spikeRunAround(points, 0)).toBeUndefined();
    expect(spikeRunAround(points, 9)).toBeUndefined();
  });
});
