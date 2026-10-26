import { describe, expect, it } from 'vitest';
import { decodeTrack, encodeTrack } from './track-polyline.util';
import { decodeStrokeTimes, encodeStrokeTimes, parseCalibrationCsv, strokeFigures, strokeTimesBase } from './track-strokes.util';

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

describe('parseCalibrationCsv', () => {
  it('parses the rows after the header; an empty speed is null', () => {
    expect(parseCalibrationCsv('t_ms,ax,ay,az,gps_speed\n1000,0.1,-0.2,0.3,2.50\n1020,0.0,0.0,0.1,\n')).toEqual([
      { t: 1000, ax: 0.1, ay: -0.2, az: 0.3, speed: 2.5 },
      { t: 1020, ax: 0, ay: 0, az: 0.1, speed: null },
    ]);
  });
  it('skips broken lines', () => expect(parseCalibrationCsv('t_ms,ax,ay,az,gps_speed\nx,1,2\n\n')).toEqual([]));
});

describe('strokeTimesBase (upload and read-back agree, spec 1.122 2c)', () => {
  it('round-trips stroke times through the polyline encoding exactly', () => {
    const points = [{ lat: 47, lng: 8, t: T0 + 499 }, { lat: 47.001, lng: 8, t: T0 + 60_499 }];
    const times = [T0 + 2_100, T0 + 4_600, T0 + 7_050];
    const stored = encodeStrokeTimes(times, strokeTimesBase(points));
    const readBack = decodeTrack(encodeTrack(points));
    expect(decodeStrokeTimes(stored, strokeTimesBase(readBack))).toEqual(times);
  });
  it('is 0 without points', () => expect(strokeTimesBase([])).toBe(0));
});
