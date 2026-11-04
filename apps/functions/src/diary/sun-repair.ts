// apps/functions/src/diary/sun-repair.ts

/** How stored sun times compare with freshly computed ones; only 'shifted' and 'polar' are repaired. */
export type SunVerdict = 'same' | 'shifted' | 'polar' | 'missing' | 'other';

interface SunTimes { sunrise: string; sunset: string }

/** Grid or model updates move a time by a minute or two; that stays the same clock-change error. */
const SHIFT_TOLERANCE = 2;
const DAY_MINUTES = 24 * 60;

function minutes(time: string): number {
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

/** Signed distance on the 24h clock, so 23:40 → 00:40 is +60 and not −1380. */
export function clockDiff(from: string, to: string): number {
  const diff = (minutes(to) - minutes(from) + DAY_MINUTES) % DAY_MINUTES;
  return diff > DAY_MINUTES / 2 ? diff - DAY_MINUTES : diff;
}

function isOneHour(diff: number): boolean {
  return Math.abs(Math.abs(diff) - 60) <= SHIFT_TOLERANCE;
}

/**
 * The repair's one judgement. A clock-change error moves sunrise and sunset by the same hour, in
 * the same direction; anything else may be a genuine value from the imported files and is left alone.
 */
export function classifySunTimes(stored: SunTimes, fresh: SunTimes): SunVerdict {
  const hasStored = !!stored.sunrise && !!stored.sunset;
  const hasFresh = !!fresh.sunrise && !!fresh.sunset;
  if (!hasFresh) return hasStored && stored.sunrise === stored.sunset ? 'polar' : hasStored ? 'other' : 'same';
  if (!hasStored) return 'missing';
  const rise = clockDiff(stored.sunrise, fresh.sunrise);
  const set = clockDiff(stored.sunset, fresh.sunset);
  if (rise === 0 && set === 0) return 'same';
  return isOneHour(rise) && isOneHour(set) && Math.sign(rise) === Math.sign(set) ? 'shifted' : 'other';
}
