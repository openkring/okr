import { describe, expect, it } from 'vitest';

import { swipeDirection } from './mampf.input';

describe('swipeDirection', () => {
  it('ignores movements below the threshold', () => {
    expect(swipeDirection(10, -20, 24)).toBeNull();
  });

  it('follows the dominant axis', () => {
    expect(swipeDirection(30, 10, 24)).toBe('right');
    expect(swipeDirection(-30, 29, 24)).toBe('left');
    expect(swipeDirection(5, 40, 24)).toBe('down');
    expect(swipeDirection(-5, -40, 24)).toBe('up');
  });
});
