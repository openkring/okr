import { describe, expect, it } from 'vitest';
import { decodeStrokeTimes, encodeStrokeTimes, strokeFigures } from './track-strokes.util';

const T0 = 1_761_465_600_000;
const every = (n: number, gapMs: number, from = T0) => Array.from({ length: n }, (_, i) => from + i * gapMs);

describe('strokeFigures', () => {
  it('counts strokes and rates of a steady row', () => {
    expect(strokeFigures(every(11, 2500))).toEqual({ strokes: 11, strokeRateAvg: 24, strokeRateMax: 24 });
  });
  it('leaves a long break out of the average', () => {
    const a = every(6, 2500);
    const b = every(6, 2500, a[5] + 60_000);
    expect(strokeFigures([...a, ...b]).strokeRateAvg).toBe(24);
  });
  it('finds a fast burst as the maximum', () => {
    const slow = every(25, 2500);
    const burst = every(17, 1875, slow[24] + 2500);
    const after = every(10, 2500, burst[16] + 2500);
    expect(strokeFigures([...slow, ...burst, ...after]).strokeRateMax).toBe(32);
  });
  it('has no maximum below 5 strokes', () => {
    const f = strokeFigures(every(4, 2500));
    expect(f.strokes).toBe(4);
    expect('strokeRateMax' in f).toBe(false);
  });
  it('is empty without strokes', () => expect(strokeFigures([])).toEqual({}));
});

describe('encodeStrokeTimes / decodeStrokeTimes', () => {
  it('round-trips', () => {
    const times = [T0 + 1200, T0 + 3700, T0 + 6150];
    const s = encodeStrokeTimes(times, T0);
    expect(s).toBe('1200,2500,2450');
    expect(decodeStrokeTimes(s, T0)).toEqual(times);
  });
  it('decodes nothing to []', () => {
    expect(decodeStrokeTimes(undefined, T0)).toEqual([]);
    expect(decodeStrokeTimes('', T0)).toEqual([]);
  });
});
