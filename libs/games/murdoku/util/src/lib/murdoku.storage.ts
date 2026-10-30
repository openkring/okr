import { MURDOKU_DIFFICULTIES, MurdokuDifficulty, Placement, boardSize } from './murdoku.engine';

/*
 * The running case lives in `localStorage` under one key, so a reload or a locked phone resumes
 * it. The case itself is not stored: `generatePuzzle(difficulty, seed)` deals it again exactly,
 * so only the seed and the player's moves are kept. Everything read back goes through a parser:
 * an entry that does not parse is treated as absent, so a hand-edited value can never lock the page.
 */

export const MURDOKU_GAME_KEY = 'murdoku.game';
export const MURDOKU_STATS_KEY = 'murdoku.stats';

/** play → (everyone placed correctly) accuse → closed; or play → revealed by giving up. */
export type MurdokuPhase = 'play' | 'accuse' | 'closed' | 'revealed';
export const MURDOKU_PHASES: readonly MurdokuPhase[] = ['play', 'accuse', 'closed', 'revealed'];

export type MurdokuGame = {
  difficulty: MurdokuDifficulty;
  seed: number;
  placement: Placement;
  /** People placed by a hint; they cannot be moved any more. */
  locked: number[];
  /** Squares the player crossed out. */
  marks: number[];
  hints: number;
  /** Playing time so far; the clock does not run while the page is closed. */
  elapsedMs: number;
  phase: MurdokuPhase;
};

export type MurdokuLevelStats = { solved: number; bestMs: number | null };
export type MurdokuStats = Record<MurdokuDifficulty, MurdokuLevelStats> & { streak: number };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isIndexList = (v: unknown, max: number): v is number[] => Array.isArray(v) && v.every(i => isCount(i) && i < max);

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** A saved game, or null if any field is missing or does not fit the board. */
export function parseGame(raw: string | null): MurdokuGame | null {
  const v = parseJson(raw);
  if (!isObject(v)) return null;
  const { difficulty, seed, placement, locked, marks, hints, elapsedMs, phase } = v;
  if (!MURDOKU_DIFFICULTIES.includes(difficulty as MurdokuDifficulty)) return null;
  const n = boardSize(difficulty as MurdokuDifficulty);
  if (!isCount(seed) || !isCount(hints) || !isCount(elapsedMs)) return null;
  if (!MURDOKU_PHASES.includes(phase as MurdokuPhase)) return null;
  if (!Array.isArray(placement) || placement.length !== n) return null;
  if (!placement.every(c => c === null || (isCount(c) && c < n * n))) return null;
  if (!isIndexList(locked, n) || !isIndexList(marks, n * n)) return null;
  return {
    difficulty: difficulty as MurdokuDifficulty,
    seed,
    placement: placement as Placement,
    locked, marks, hints, elapsedMs,
    phase: phase as MurdokuPhase,
  };
}

export const serializeGame = (game: MurdokuGame): string => JSON.stringify(game);

export function emptyStats(): MurdokuStats {
  return {
    easy: { solved: 0, bestMs: null },
    medium: { solved: 0, bestMs: null },
    hard: { solved: 0, bestMs: null },
    streak: 0,
  };
}

/** Saved stats; anything unreadable counts as zero. */
export function parseStats(raw: string | null): MurdokuStats {
  const v = parseJson(raw);
  const out = emptyStats();
  if (!isObject(v)) return out;
  for (const d of MURDOKU_DIFFICULTIES) {
    const level = v[d];
    if (!isObject(level)) continue;
    if (isCount(level['solved'])) out[d].solved = level['solved'];
    if (isCount(level['bestMs'])) out[d].bestMs = level['bestMs'];
  }
  if (isCount(v['streak'])) out.streak = v['streak'];
  return out;
}

/**
 * Stats after a closed case. A case solved with hints counts as solved but never as a best time.
 */
export function recordSolved(stats: MurdokuStats, difficulty: MurdokuDifficulty, elapsedMs: number, hints: number): MurdokuStats {
  const level = stats[difficulty];
  const bestMs = hints === 0 && (level.bestMs === null || elapsedMs < level.bestMs) ? elapsedMs : level.bestMs;
  return { ...stats, [difficulty]: { solved: level.solved + 1, bestMs }, streak: stats.streak + 1 };
}

/** Giving up ends the streak. */
export const recordGivenUp = (stats: MurdokuStats): MurdokuStats => ({ ...stats, streak: 0 });

export const serializeStats = (stats: MurdokuStats): string => JSON.stringify(stats);
