import { describe, expect, it } from 'vitest';

import { formatElapsed } from './zip.format';

describe('formatElapsed', () => {
  it('reads zero on a board that has not started', () => {
    expect(formatElapsed(0)).toBe('0:00');
  });

  it('pads the seconds but not the minutes', () => {
    expect(formatElapsed(5_000)).toBe('0:05');
    expect(formatElapsed(65_000)).toBe('1:05');
    expect(formatElapsed(600_000)).toBe('10:00');
  });

  it('truncates rather than rounds, so the reading never runs ahead', () => {
    expect(formatElapsed(1_999)).toBe('0:01');
  });

  it('grows an hours part only once it is needed', () => {
    expect(formatElapsed(3_599_000)).toBe('59:59');
    expect(formatElapsed(3_600_000)).toBe('1:00:00');
    expect(formatElapsed(3_661_000)).toBe('1:01:01');
  });

  it('reads zero for a clock that moved backwards or a non-finite input', () => {
    expect(formatElapsed(-1)).toBe('0:00');
    expect(formatElapsed(Number.NaN)).toBe('0:00');
  });
});
