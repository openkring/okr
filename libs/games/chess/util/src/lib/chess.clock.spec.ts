import { describe, expect, it } from 'vitest';
import { createClock, flagged, formatClock, pauseClock, pressClock, remainingMs } from './chess.clock';

describe('chess clock', () => {
  it('starts paused with the full time', () => {
    const c = createClock(5);
    expect(c).toEqual({ remaining: { w: 300_000, b: 300_000 }, running: null, since: null });
  });

  it('runs the side that did not just move', () => {
    const afterWhite = pressClock(createClock(5), 'w', 1_000);
    expect(afterWhite.running).toBe('b');
    expect(remainingMs(afterWhite, 'b', 4_000)).toBe(297_000);
    expect(remainingMs(afterWhite, 'w', 4_000)).toBe(300_000);

    const afterBlack = pressClock(afterWhite, 'b', 4_000);
    expect(afterBlack.remaining.b).toBe(297_000);
    expect(afterBlack.running).toBe('w');
  });

  it('pauses by booking the elapsed time', () => {
    const paused = pauseClock(pressClock(createClock(5), 'w', 0), 10_000);
    expect(paused).toEqual({ remaining: { w: 300_000, b: 290_000 }, running: null, since: null });
  });

  it('reports the side whose time is up', () => {
    const c = { remaining: { w: 60_000, b: 1_000 }, running: 'b' as const, since: 0 };
    expect(flagged(c, 999)).toBeNull();
    expect(flagged(c, 1_000)).toBe('b');
    expect(remainingMs(c, 'b', 5_000)).toBe(0);
  });

  it('formats minutes and, under ten seconds, tenths', () => {
    expect(formatClock(300_000)).toBe('5:00');
    expect(formatClock(61_001)).toBe('1:02');
    expect(formatClock(9_250)).toBe('9.3');
    expect(formatClock(0)).toBe('0.0');
  });
});
