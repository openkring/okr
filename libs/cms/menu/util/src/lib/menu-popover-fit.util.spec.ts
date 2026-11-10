import { describe, expect, it } from 'vitest';

import { popoverOffsetX } from './menu-popover-fit.util';

describe('popoverOffsetX', () => {
  it('leaves a popover that fits alone', () => {
    expect(popoverOffsetX(100, 200, 402)).toBe(0);
  });

  it('shifts a popover that grew past the right edge back inside (the reported iOS case)', () => {
    // measured narrow, placed at 333, then the labels arrived: 250 px wide
    expect(popoverOffsetX(333, 250, 402)).toBe(402 - 8 - 250 - 333);
  });

  it('keeps the start visible when the box is wider than the screen', () => {
    expect(popoverOffsetX(333, 500, 402)).toBe(8 - 333);
  });

  it('moves back towards Ionic\'s position when the box shrinks again', () => {
    // previously shifted by -200 (now at 133), the box shrank to 60 px: base 333 fits again (333+60 <= 394)
    expect(popoverOffsetX(133, 60, 402, -200)).toBe(0);
  });

  it('is stable when the shift is already applied', () => {
    const offset = popoverOffsetX(333, 250, 402);
    expect(popoverOffsetX(333 + offset, 250, 402, offset)).toBe(offset);
  });

  it('never moves a fitting box to the right', () => {
    expect(popoverOffsetX(20, 100, 402)).toBe(0);
  });
});
