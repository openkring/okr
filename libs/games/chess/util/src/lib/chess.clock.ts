import { Color, opponent } from './chess.types';

/** A chess clock on wall-clock timestamps, so it stays right while the app sleeps. */
export interface ClockState {
  /** Milliseconds left per side, as of `since` for the running side. */
  readonly remaining: Readonly<Record<Color, number>>;
  /** The side whose time runs; null before the first move and while paused. */
  readonly running: Color | null;
  readonly since: number | null;
}

export function createClock(minutes: number): ClockState {
  const ms = minutes * 60_000;
  return { remaining: { w: ms, b: ms }, running: null, since: null };
}

export function remainingMs(clock: ClockState, color: Color, now: number): number {
  const elapsed = clock.running === color && clock.since !== null ? now - clock.since : 0;
  return Math.max(0, clock.remaining[color] - elapsed);
}

/** Books the running side's elapsed time and stops the clock. */
export function pauseClock(clock: ClockState, now: number): ClockState {
  if (clock.running === null) return clock;
  return {
    remaining: { ...clock.remaining, [clock.running]: remainingMs(clock, clock.running, now) },
    running: null,
    since: null,
  };
}

/** `mover` has just moved: their time stops, the opponent's starts. */
export function pressClock(clock: ClockState, mover: Color, now: number): ClockState {
  return { ...pauseClock(clock, now), running: opponent(mover), since: now };
}

/** The side whose time is up, or null. */
export function flagged(clock: ClockState, now: number): Color | null {
  for (const c of ['w', 'b'] as const) if (remainingMs(clock, c, now) <= 0) return c;
  return null;
}

/** `m:ss`, rounded up so 0:00 only shows when the time is really gone; tenths below ten seconds. */
export function formatClock(ms: number): string {
  if (ms < 10_000) return (Math.ceil(ms / 100) / 10).toFixed(1);
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
