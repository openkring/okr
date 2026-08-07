import { describe, expect, it } from 'vitest';
import { shiftPeriod } from './index';

// `shiftPeriod` is the one piece of arithmetic in this module that is not delegated to the util
// libs, and it is used to find the two previous months a hysteresis decision reads. Getting the
// year boundary wrong would silently drop the history and re-band a tenant every January.
describe('shiftPeriod', () => {
  it('steps back inside a year', () => {
    expect(shiftPeriod('2026-08', -1)).toBe('2026-07');
    expect(shiftPeriod('2026-08', -2)).toBe('2026-06');
  });

  it('crosses the year boundary in both directions', () => {
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod('2026-01', -2)).toBe('2025-11');
    expect(shiftPeriod('2025-12', 1)).toBe('2026-01');
  });

  it('keeps the two-digit month padding', () => {
    expect(shiftPeriod('2026-10', -1)).toBe('2026-09');
    expect(shiftPeriod('2026-11', -2)).toBe('2026-09');
  });
});
