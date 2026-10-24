import { describe, expect, it } from 'vitest';
import { BOOK_MAP_DEFAULT_MAX_ZOOM, bookMapBounds, bookMapMaxZoom, bookMapPixels, mmToPx } from './journal-book-map.util';

describe('bookMapPixels', () => {
  it('converts mm to pixels at 300 dpi', () => {
    expect(bookMapPixels({ w: 303, h: 216 }, 300)).toEqual({ width: 3579, height: 2551 });
    expect(bookMapPixels({ w: 25.4, h: 50.8 }, 300)).toEqual({ width: 300, height: 600 });
  });
  it('scales with dpi and never returns 0', () => {
    expect(bookMapPixels({ w: 25.4, h: 25.4 }, 150)).toEqual({ width: 150, height: 150 });
    expect(bookMapPixels({ w: 0, h: 0 }, 300)).toEqual({ width: 1, height: 1 });
  });
  it('mmToPx', () => {
    expect(mmToPx(25.4, 300)).toBe(300);
  });
});

describe('bookMapBounds', () => {
  it('is undefined without points', () => {
    expect(bookMapBounds([], 0.1)).toBeUndefined();
    expect(bookMapBounds([[NaN, 1]], 0.1)).toBeUndefined();
  });
  it('pads the span on every side', () => {
    expect(bookMapBounds([[0, 0], [10, 20]], 0.1)).toEqual([-1, -2, 11, 22]);
  });
  it('gives a single point a minimum window', () => {
    const [w, s, e, n] = bookMapBounds([[-60, -63]], 0)!;
    expect(e - w).toBeCloseTo(0.02);
    expect(n - s).toBeCloseTo(0.02);
    expect((w + e) / 2).toBeCloseTo(-60);
  });
  it('stays inside the Mercator range', () => {
    expect(bookMapBounds([[-179, -84], [179, 84]], 0.5)).toEqual([-180, -85, 180, 85]);
  });
  it('ignores a negative pad', () => {
    expect(bookMapBounds([[0, 0], [10, 10]], -1)).toEqual([0, 0, 10, 10]);
  });
});

describe('zoom limit', () => {
  it('takes the finest layer', () => {
    expect(bookMapMaxZoom([8, 12, 10])).toBe(12);
    expect(bookMapMaxZoom([])).toBe(BOOK_MAP_DEFAULT_MAX_ZOOM);
  });
});
