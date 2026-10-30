import { describe, it, expect } from 'vitest';
import { tooSparse, validPoints } from './index';

describe('validPoints', () => {
  it('rounds to 5 decimals', () => {
    expect(validPoints({ points: [{ lat: 47.123456789, lng: 8.987654321 }, { lat: 47, lng: 8 }] }))
      .toEqual([{ lat: 47.12346, lng: 8.98765 }, { lat: 47, lng: 8 }]);
  });

  it('rejects too few, too many and broken points', () => {
    expect(() => validPoints({ points: [{ lat: 1, lng: 1 }] })).toThrow();
    expect(() => validPoints({ points: new Array(101).fill({ lat: 1, lng: 1 }) })).toThrow();
    expect(() => validPoints({ points: [{ lat: 91, lng: 1 }, { lat: 1, lng: 1 }] })).toThrow();
    expect(() => validPoints({ points: [{ lat: '1', lng: 1 }, { lat: 1, lng: 1 }] })).toThrow();
    expect(() => validPoints(undefined)).toThrow();
  });
});

describe('tooSparse', () => {
  it('is true above 10 % missing heights', () => {
    expect(tooSparse([1, 2, 3, 4, 5, 6, 7, 8, 9, null])).toBe(false);
    expect(tooSparse([1, 2, 3, 4, 5, 6, 7, 8, null, null])).toBe(true);
  });
});
