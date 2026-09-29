/** `daily`: one word per day and length, the same for everybody. `endless`: a fresh random word each round. */
export type WordleMode = 'daily' | 'endless';
export const WORDLE_MODES: readonly WordleMode[] = ['daily', 'endless'];

/** The word lengths the catalogue serves. */
export const WORDLE_LENGTHS = [4, 5, 6, 7] as const;
export const WORDLE_DEFAULT_LENGTH = 5;

/** How many guesses a round allows. */
export const WORDLE_MIN_TRIES = 3;
export const WORDLE_MAX_TRIES = 10;
export const WORDLE_DEFAULT_TRIES = 6;
export const WORDLE_TRIES: readonly number[] =
  Array.from({ length: WORDLE_MAX_TRIES - WORDLE_MIN_TRIES + 1 }, (_, i) => WORDLE_MIN_TRIES + i);

/**
 * How one letter of a submitted guess scored:
 * `correct` — right letter, right place; `present` — in the word, elsewhere; `absent` — not (again) in the word.
 */
export type LetterState = 'correct' | 'present' | 'absent';

export type WordleStatus = 'playing' | 'won' | 'lost';

/** The player's settings, kept in `localStorage`. */
export interface WordleConfig {
  mode: WordleMode;
  length: number;
  maxTries: number;
}

/**
 * One round. `guesses` holds only SUBMITTED guesses; the row being typed lives in the store.
 * `maxTries` is frozen when the round is dealt, so changing the setting mid-round cannot turn
 * a lost round into a running one (it applies to the next round).
 */
export interface WordleGame {
  mode: WordleMode;
  /** StoreDate (`yyyymmdd`) of the daily word; absent for endless rounds. */
  day?: string;
  length: number;
  maxTries: number;
  solution: string;
  guesses: string[];
}

/** Why a submission was refused. */
export type WordleRejection = 'too-short' | 'finished';

/**
 * Results of one (mode, length) bucket. `dist[n]` counts the rounds won with n guesses.
 * `lastDay` is the StoreDate of the last daily round counted — a daily streak only continues
 * on the following calendar day.
 */
export interface WordleStats {
  played: number;
  won: number;
  streak: number;
  maxStreak: number;
  dist: Record<number, number>;
  lastDay?: string;
}
