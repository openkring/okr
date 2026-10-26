import { describe, expect, it } from 'vitest';
import type { TrackPoint } from './track-polyline.util';
import { liveSplitS, rowSplits } from './track-split.util';

const M_PER_DEG = (6371008.8 * Math.PI) / 180;
const T0 = Date.UTC(2026, 9, 26, 8, 0, 0);

/** Points along a meridian, starting at `fromM` metres and `fromMs`; one point every `stepM` metres at `speed` m/s. */
function run(fromM: number, toM: number, speed: number, fromMs: number, stepM = 10): TrackPoint[] {
  const out: TrackPoint[] = [];
  for (let m = fromM; m <= toM + 1e-9; m += stepM) out.push({ lat: 47 + m / M_PER_DEG, lng: 8.5, t: fromMs + ((m - fromM) / speed) * 1000 });
  return out;
}

/** Appends points that stay at the last position for `seconds`, one per `everyS` seconds. */
function stop(points: TrackPoint[], seconds: number, everyS = 5): TrackPoint[] {
  const last = points[points.length - 1];
  const out = [...points];
  for (let s = everyS; s <= seconds; s += everyS) out.push({ ...last, t: last.t + s * 1000 });
  return out;
}

function then(points: TrackPoint[], toM: number, speed: number): TrackPoint[] {
  const last = points[points.length - 1];
  const fromM = (last.lat - 47) * M_PER_DEG;
  return [...points, ...run(fromM, toM, speed, last.t).slice(1)];
}

describe('rowSplits', () => {
  it('steady 2.5 m/s over 1000 m gives 200 s average and best', () => {
    expect(rowSplits(run(0, 1000, 2.5, T0))).toEqual({ splitAvgS: 200, splitBestS: 200 });
  });

  it('leaves a 60 s stop out of the average', () => {
    const points = then(stop(run(0, 500, 2.5, T0), 60), 1000, 2.5);
    expect(rowSplits(points).splitAvgS).toBe(200);
  });

  it('counts a slow stretch of 10 s or less as moving time', () => {
    const points = then(stop(run(0, 500, 2.5, T0), 5), 1000, 2.5);
    expect(rowSplits(points).splitAvgS).toBe(202.5);
  });

  it('finds the fastest continuous 500 m', () => {
    const points = then(run(0, 500, 2, T0), 1000, 4);
    expect(rowSplits(points).splitBestS).toBe(125);
  });

  it('has no best split below 500 m', () => {
    const r = rowSplits(run(0, 400, 2.5, T0));
    expect(r.splitBestS).toBeUndefined();
    expect(r.splitAvgS).toBe(200);
  });

  it('is empty for 0 or 1 point', () => {
    expect(rowSplits([])).toEqual({});
    expect(rowSplits(run(0, 0, 2.5, T0))).toEqual({});
  });
});

describe('liveSplitS', () => {
  const now = T0 + 60_000;
  it('averages the speeds of the last 10 s', () => {
    expect(liveSplitS([{ speed: 2.5, time: now - 9000 }, { speed: 2.5, time: now - 5000 }, { speed: 2.5, time: now }], now)).toBe(200);
  });
  it('ignores fixes older than 10 s', () => {
    expect(liveSplitS([{ speed: 10, time: now - 11_000 }, { speed: 2.5, time: now - 1000 }], now)).toBe(200);
  });
  it('is undefined below 1 m/s', () => {
    expect(liveSplitS([{ speed: 0.5, time: now - 1000 }, { speed: 0.8, time: now }], now)).toBeUndefined();
  });
  it('skips null speeds', () => {
    expect(liveSplitS([{ speed: null, time: now - 1000 }, { speed: 2.5, time: now }], now)).toBe(200);
  });
  it('is undefined without fixes', () => {
    expect(liveSplitS([], now)).toBeUndefined();
  });
});
