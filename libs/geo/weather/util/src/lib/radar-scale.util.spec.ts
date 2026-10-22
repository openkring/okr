import { describe, expect, it } from 'vitest';
import { RADAR_SCALE, hexToRgb, radarScaleGradient, radarScaleIndex } from './radar-scale.util';

describe('radarScaleIndex', () => {
  it('treats dry, drizzle clutter and missing data as transparent', () => {
    expect(radarScaleIndex(0)).toBe(-1);
    expect(radarScaleIndex(0.07)).toBe(-1);
    expect(radarScaleIndex(Number.NaN)).toBe(-1);
  });

  it('includes each lower bound in its own step', () => {
    expect(radarScaleIndex(0.1)).toBe(0);
    expect(radarScaleIndex(0.49)).toBe(0);
    expect(radarScaleIndex(4)).toBe(4);
  });

  it('puts everything above the last bound in the last step', () => {
    expect(radarScaleIndex(500)).toBe(RADAR_SCALE.length - 1);
  });
});

describe('hexToRgb', () => {
  it('splits a hex colour', () => {
    expect(hexToRgb('#c10000')).toEqual([193, 0, 0]);
    expect(hexToRgb('#88ddee')).toEqual([136, 221, 238]);
  });
});

describe('radarScaleGradient', () => {
  it('lists every colour in order', () => {
    expect(radarScaleGradient()).toBe(`linear-gradient(90deg, ${RADAR_SCALE.map((s) => s.color).join(', ')})`);
  });
});
