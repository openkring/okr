import { describe, expect, it } from 'vitest';
import { fragmentScrollTop } from './page-scroll.util';

describe('fragmentScrollTop', () => {
  it('measures the target relative to the scroll container, not the viewport', () => {
    // toolbar of 56px above the scroll container; target sits 300px below the container top
    expect(fragmentScrollTop(356, 56, 0)).toBe(300);
  });

  it('adds the current scroll offset', () => {
    expect(fragmentScrollTop(356, 56, 120)).toBe(420);
  });

  it('subtracts a sticky offset and never returns a negative position', () => {
    expect(fragmentScrollTop(356, 56, 0, 100)).toBe(200);
    expect(fragmentScrollTop(66, 56, 0, 100)).toBe(0);
  });

  it('is unaffected by a page-enter transform that shifts container and target alike', () => {
    // mid-transition the whole page is translated by 40px: both rects move together
    expect(fragmentScrollTop(396, 96, 0)).toBe(300);
  });
});
