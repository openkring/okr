/**
 * Hybrid logical clock for the travel-journal change log (spec 1.113 §5.1).
 *
 * The wall part follows the device clock, the counter orders events within one millisecond and
 * keeps the clock moving forward when the device clock jumps back (a time-zone change on board).
 * The formatted string sorts lexicographically in clock order; the trailing deviceId breaks ties.
 */
export interface Hlc { wall: number; counter: number; deviceId: string }

const WALL_DIGITS = 15;
const COUNTER_DIGITS = 6;

export function formatHlc(h: Hlc): string {
  return `${String(h.wall).padStart(WALL_DIGITS, '0')}:${String(h.counter).padStart(COUNTER_DIGITS, '0')}:${h.deviceId}`;
}

export function parseHlc(s: string): Hlc {
  const first = s.indexOf(':');
  const second = s.indexOf(':', first + 1);
  return { wall: Number(s.slice(0, first)), counter: Number(s.slice(first + 1, second)), deviceId: s.slice(second + 1) };
}

/** The clock for a local event. */
export function tickHlc(prev: Hlc | undefined, now: number, deviceId: string): Hlc {
  if (!prev || now > prev.wall) return { wall: now, counter: 0, deviceId };
  return { wall: prev.wall, counter: prev.counter + 1, deviceId };
}

/** The local clock after receiving a remote record. */
export function receiveHlc(local: Hlc, remote: Hlc, now: number): Hlc {
  const wall = Math.max(local.wall, remote.wall, now);
  let counter = 0;
  if (wall === local.wall && wall === remote.wall) counter = Math.max(local.counter, remote.counter) + 1;
  else if (wall === local.wall) counter = local.counter + 1;
  else if (wall === remote.wall) counter = remote.counter + 1;
  return { wall, counter, deviceId: local.deviceId };
}

export function compareHlc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const HLC_PATTERN = /^\d{15}:\d{6}:(.+)$/;

/** True when `hlc` has the exact format and names `deviceId` — the device that wrote the record. */
export function isValidHlc(hlc: string, deviceId: string): boolean {
  const match = HLC_PATTERN.exec(hlc);
  return match !== null && match[1] === deviceId;
}
