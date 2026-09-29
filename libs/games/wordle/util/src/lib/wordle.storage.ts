import { emptyStats } from './wordle.stats';
import {
  WORDLE_DEFAULT_LENGTH,
  WORDLE_DEFAULT_TRIES,
  WORDLE_LENGTHS,
  WORDLE_MAX_TRIES,
  WORDLE_MIN_TRIES,
  WORDLE_MODES,
  WordleConfig,
  WordleGame,
  WordleMode,
  WordleStats,
} from './wordle.types';

/*
 * Everything the page remembers lives in `localStorage` under these keys, and everything read
 * back goes through a parser below. A half-written or hand-edited entry must never lock the page
 * until site data is cleared — an entry that does not parse is simply treated as absent.
 */

export const WORDLE_CONFIG_KEY = 'wordle.config';

/** The saved round of one mode; the daily round is kept per length, so switching length resumes it. */
export function wordleGameKey(mode: WordleMode, length: number): string {
  return mode === 'daily' ? `wordle.game.daily.${length}` : 'wordle.game.endless';
}

export function wordleStatsKey(mode: WordleMode, length: number): string {
  return `wordle.stats.${mode}.${length}`;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isLength = (v: unknown): v is number => (WORDLE_LENGTHS as readonly unknown[]).includes(v);
const isTries = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= WORDLE_MIN_TRIES && v <= WORDLE_MAX_TRIES;
const isWord = (v: unknown, length: number): v is string =>
  typeof v === 'string' && v.length === length && /^[A-Z]+$/.test(v);

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function defaultConfig(): WordleConfig {
  return { mode: 'daily', length: WORDLE_DEFAULT_LENGTH, maxTries: WORDLE_DEFAULT_TRIES };
}

/** The settings, each field falling back to its default on its own. */
export function parseConfig(raw: string | null): WordleConfig {
  const v = parseJson(raw);
  const d = defaultConfig();
  if (!isObject(v)) return d;
  return {
    mode: WORDLE_MODES.includes(v['mode'] as WordleMode) ? (v['mode'] as WordleMode) : d.mode,
    length: isLength(v['length']) ? v['length'] : d.length,
    maxTries: isTries(v['maxTries']) ? v['maxTries'] : d.maxTries,
  };
}

/** A saved round, or null if any field the board dereferences is missing or inconsistent. */
export function parseGame(raw: string | null): WordleGame | null {
  const v = parseJson(raw);
  if (!isObject(v)) return null;
  const { mode, day, length, maxTries, solution, guesses } = v;
  if (!WORDLE_MODES.includes(mode as WordleMode) || !isLength(length) || !isTries(maxTries)) return null;
  if (!isWord(solution, length)) return null;
  if (!Array.isArray(guesses) || guesses.length > maxTries || !guesses.every(g => isWord(g, length))) return null;
  if (mode === 'daily' && !(typeof day === 'string' && /^\d{8}$/.test(day))) return null;
  return {
    mode: mode as WordleMode,
    ...(mode === 'daily' ? { day: day as string } : {}),
    length,
    maxTries,
    solution,
    guesses: guesses as string[],
  };
}

export function parseStats(raw: string | null): WordleStats {
  const v = parseJson(raw);
  if (!isObject(v)) return emptyStats();
  const { played, won, streak, maxStreak, dist, lastDay } = v;
  if (![played, won, streak, maxStreak].every(isCount) || !isObject(dist)) return emptyStats();
  const cleanDist: Record<number, number> = {};
  for (const [k, n] of Object.entries(dist)) {
    const tries = Number(k);
    if (isTries(tries) && isCount(n)) cleanDist[tries] = n;
  }
  return {
    played: played as number,
    won: won as number,
    streak: streak as number,
    maxStreak: maxStreak as number,
    dist: cleanDist,
    ...(typeof lastDay === 'string' && /^\d{8}$/.test(lastDay) ? { lastDay } : {}),
  };
}
