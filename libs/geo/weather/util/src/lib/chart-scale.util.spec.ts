import { describe, expect, it } from 'vitest';

import { hourStep, niceScale } from './chart-scale.util';

describe('niceScale', () => {
  it('widens the range to round ticks', () => {
    expect(niceScale(0, 45, 4)).toEqual({ min: 0, max: 60, ticks: [0, 20, 40, 60] });
  });

  it('handles negative temperatures', () => {
    const s = niceScale(-3, 7, 4);
    expect(s.min).toBeLessThanOrEqual(-3);
    expect(s.max).toBeGreaterThanOrEqual(7);
    expect(s.ticks).toContain(0);
  });

  it('keeps a near-flat zero-based series small (minSpan)', () => {
    const s = niceScale(0, 0.2, 3, 1);
    expect(s.min).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(1);
  });

  it('centres a flat non-zero series', () => {
    const s = niceScale(12, 12, 4, 4);
    expect(s.min).toBeLessThanOrEqual(10);
    expect(s.max).toBeGreaterThanOrEqual(14);
  });

  it('survives non-finite input', () => {
    const s = niceScale(Number.NaN, Number.POSITIVE_INFINITY, 4, 1);
    expect(s.ticks.length).toBeGreaterThan(1);
  });

  it('uses fractional steps for small ranges', () => {
    expect(niceScale(0, 1, 3).ticks).toEqual([0, 0.5, 1]);
  });
});

describe('hourStep', () => {
  it('returns 1 when every hour fits', () => {
    expect(hourStep(24, 1200, 40)).toBe(1);
  });

  it('snaps to a divisor of 24', () => {
    // 72 hours at 46 px each into 900 px needs 3.68 h per cell → 4
    expect(hourStep(72, 900, 46)).toBe(4);
  });

  it('caps at one cell per day', () => {
    expect(hourStep(144, 200, 46)).toBe(24);
  });

  it('degrades gracefully for an unmeasured width', () => {
    expect(hourStep(24, 0, 40)).toBe(1);
  });
});
