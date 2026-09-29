import { describe, expect, it } from 'vitest';

import { contrastRatio, parseCssColor } from './mampf.color';

describe('parseCssColor', () => {
  it('reads hex and rgb()/rgba() forms', () => {
    expect(parseCssColor('#fff')).toEqual([255, 255, 255]);
    expect(parseCssColor('#0054e9')).toEqual([0, 84, 233]);
    expect(parseCssColor('rgba(10, 20, 30, 0.5)')).toEqual([10, 20, 30]);
    expect(parseCssColor('rgb(1,2,3)')).toEqual([1, 2, 3]);
    expect(parseCssColor('')).toBeNull();
    expect(parseCssColor('var(--x)')).toBeNull();
  });
});

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for equal colours', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([90, 90, 90], [90, 90, 90])).toBe(1);
  });
});
