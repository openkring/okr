import { wordleWords } from './wordle.words';

const DAY_MS = 86_400_000;

/**
 * Days since 1970-01-01 for a StoreDate (`yyyymmdd`), counted on the CALENDAR date — the string
 * is read as a UTC date, so the result does not depend on the device's time zone or on DST.
 * The caller supplies the local calendar date (`getTodayStr()`), which is what makes the daily
 * word change at local midnight for everybody in the same time zone.
 */
export function dayNumber(storeDate: string): number {
  const y = Number(storeDate.slice(0, 4));
  const m = Number(storeDate.slice(4, 6));
  const d = Number(storeDate.slice(6, 8));
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** True if `later` is exactly the calendar day after `earlier` (both StoreDate). */
export function isNextDay(earlier: string, later: string): boolean {
  return dayNumber(later) - dayNumber(earlier) === 1;
}

/** mulberry32: a tiny seeded PRNG, so a shuffle is identical on every device. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates over a copy, driven by `random`. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const dailyOrder = new Map<number, readonly string[]>();

/**
 * The word of the day for one length — the same on every device.
 *
 * Each length's list is shuffled ONCE with a fixed seed, and day n takes entry n mod size. So
 * consecutive days never repeat a word until the whole list has been played through, and
 * neighbouring days are unrelated (a plain `hash(day) mod size` would repeat words within weeks).
 *
 * Changing the catalogue reshuffles every future day — see the append-only note in
 * `wordle.words.ts`.
 */
export function dailyWord(storeDate: string, length: number, words: readonly string[] = wordleWords(length)): string {
  if (words.length === 0) return '';
  let order = words === wordleWords(length) ? dailyOrder.get(length) : undefined;
  if (!order) {
    order = shuffled(words, seededRandom(0x5eed + length));
    if (words === wordleWords(length)) dailyOrder.set(length, order);
  }
  const n = dayNumber(storeDate);
  return order[((n % order.length) + order.length) % order.length];
}

/** A random word of one length for an endless round, avoiding `previous` where the list allows. */
export function randomWord(length: number, random: () => number = Math.random, previous?: string): string {
  const words = wordleWords(length);
  if (words.length === 0) return '';
  const pool = words.length > 1 && previous ? words.filter(w => w !== previous) : words;
  return pool[Math.floor(random() * pool.length)];
}
