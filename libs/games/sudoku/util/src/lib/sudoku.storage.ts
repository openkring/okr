import { SUDOKU_CELLS, SUDOKU_DIFFICULTIES, SudokuDifficulty } from './sudoku.engine';

/*
 * The running game lives in `localStorage` under one key, so a reload or a locked phone resumes
 * it. Everything read back goes through `parseGame`: an entry that does not parse is treated as
 * absent and a fresh game is dealt, so a hand-edited value can never lock the page.
 */

export const SUDOKU_GAME_KEY = 'sudoku.game';

export type SudokuGame = {
  difficulty: SudokuDifficulty;
  givens: number[];
  solution: number[];
  values: number[];
  notes: number[];
  /** Cells revealed by a hint; they cannot be changed any more. */
  hinted: number[];
  hints: number;
  /** Playing time so far; the clock does not run while the page is closed. */
  elapsedMs: number;
  solved: boolean;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isBoard = (v: unknown, min: number, max: number): v is number[] =>
  Array.isArray(v) && v.length === SUDOKU_CELLS && v.every(x => Number.isInteger(x) && x >= min && x <= max);

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** A saved game, or null if any field is missing or inconsistent with the others. */
export function parseGame(raw: string | null): SudokuGame | null {
  const v = parseJson(raw);
  if (!isObject(v)) return null;
  const { difficulty, givens, solution, values, notes, hinted, hints, elapsedMs, solved } = v;
  if (!SUDOKU_DIFFICULTIES.includes(difficulty as SudokuDifficulty)) return null;
  if (!isBoard(solution, 1, 9) || !isBoard(givens, 0, 9) || !isBoard(values, 0, 9) || !isBoard(notes, 0, 1023)) return null;
  // every clue is part of the solution and still on the board
  if (givens.some((g, i) => g && (g !== solution[i] || values[i] !== g))) return null;
  if (!Array.isArray(hinted) || !hinted.every(i => isCount(i) && i < SUDOKU_CELLS)) return null;
  if (!isCount(hints) || !isCount(elapsedMs) || typeof solved !== 'boolean') return null;
  return {
    difficulty: difficulty as SudokuDifficulty,
    givens, solution, values, notes,
    hinted: hinted as number[],
    hints, elapsedMs, solved,
  };
}

export function serializeGame(game: SudokuGame): string {
  return JSON.stringify(game);
}
