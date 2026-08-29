import { describe, expect, it } from 'vitest';
import { buildSparklinePath, sparklinePoints } from './sparkline.util';

describe('sparklinePoints', () => {
  it('spreads points evenly across the full width', () => {
    const p = sparklinePoints([0, 1, 2], 100, 50, 0);
    expect(p.map((q) => q.x)).toEqual([0, 50, 100]);
  });

  it('puts the maximum at the top and the minimum at the bottom', () => {
    const p = sparklinePoints([10, 30, 20], 100, 100, 0);
    expect(p[1].y).toBe(0);     // 30 is the max -> top
    expect(p[0].y).toBe(100);   // 10 is the min -> bottom
    expect(p[2].y).toBe(50);
  });

  it('honours the padding so extremes do not touch the frame', () => {
    const p = sparklinePoints([0, 10], 100, 100, 10);
    expect(p[1].y).toBe(10);
    expect(p[0].y).toBe(90);
  });

  it('centres a flat series instead of dividing by zero', () => {
    const p = sparklinePoints([5, 5, 5], 100, 80, 6);
    expect(p.every((q) => q.y === 40)).toBe(true);
    expect(p.every((q) => Number.isFinite(q.y))).toBe(true);
  });

  it('centres a series of zeros — the common empty-precipitation case', () => {
    const p = sparklinePoints([0, 0, 0, 0], 100, 80);
    expect(p.every((q) => Number.isFinite(q.y))).toBe(true);
  });

  it('handles one value and no value', () => {
    expect(sparklinePoints([7], 100, 50)).toEqual([{ x: 50, y: 25 }]);
    expect(sparklinePoints([], 100, 50)).toEqual([]);
  });
});

describe('buildSparklinePath', () => {
  it('builds an SVG path', () => {
    expect(buildSparklinePath([0, 1], 100, 100, 0)).toBe('M0,100 L100,0');
  });

  it('returns an empty string for an empty series so the template renders nothing', () => {
    expect(buildSparklinePath([], 100, 100)).toBe('');
  });
});
