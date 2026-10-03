/*
 * Sudoku rules, pure. A board is a flat array of 81 cells, row by row; 0 is an empty cell.
 * Pencil marks are one bitmask per cell, bit d set for digit d (bits 1..9).
 */

export type SudokuDifficulty = 'easy' | 'medium' | 'hard';
export const SUDOKU_DIFFICULTIES: readonly SudokuDifficulty[] = ['easy', 'medium', 'hard'];

/** A random source in [0, 1) — `Math.random` in play, a seeded one in tests. */
export type Rng = () => number;

export type SudokuPuzzle = {
  difficulty: SudokuDifficulty;
  /** The clues; 0 where the player has to fill in. */
  givens: number[];
  /** The one and only solution. */
  solution: number[];
};

export const SUDOKU_CELLS = 81;
const ALL_DIGITS = 0b11_1111_1110;

/**
 * How many clues each level aims for. Clues are removed in symmetric pairs as long as the puzzle
 * stays uniquely solvable, so `hard` may end a few clues above its target on a stubborn board.
 */
export const SUDOKU_TARGET_GIVENS: Record<SudokuDifficulty, number> = { easy: 38, medium: 31, hard: 25 };

export const rowOf = (i: number): number => Math.floor(i / 9);
export const colOf = (i: number): number => i % 9;
export const boxOf = (i: number): number => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** The 20 cells sharing a row, column or box with each cell. */
export const PEERS: readonly (readonly number[])[] = Array.from({ length: SUDOKU_CELLS }, (_, i) =>
  Array.from({ length: SUDOKU_CELLS }, (_, j) => j).filter(j =>
    j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))));

/** The cells of each 3×3 box, box by box, row by row inside a box — the order the page draws them. */
export const BOXES: readonly (readonly number[])[] = Array.from({ length: 9 }, (_, b) =>
  Array.from({ length: SUDOKU_CELLS }, (_, j) => j).filter(j => boxOf(j) === b));

/** "A1" … "I9": column letter, row number. */
export function coordLabel(i: number): string {
  return 'ABCDEFGHI'[colOf(i)] + (rowOf(i) + 1);
}

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function bitCount(mask: number): number {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}

/** The digits set in a mask, ascending. */
export function maskDigits(mask: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

/** The digits still allowed in cell `i` by the placed values around it (as a mask). */
export function candidates(values: readonly number[], i: number): number {
  let used = 0;
  for (const p of PEERS[i]) used |= 1 << values[p];
  return ALL_DIGITS & ~used;
}

/**
 * Backtracking over bitmasks, always branching on the empty cell with the fewest candidates.
 * Stops after `limit` solutions; returns how many it found and the first one. With an `rng` the
 * candidates are tried in random order, which is how a fresh full board is dealt.
 */
function search(start: readonly number[], limit: number, rng?: Rng): { count: number; first: number[] | null } {
  const grid = [...start];
  const rows = new Array<number>(9).fill(0);
  const cols = new Array<number>(9).fill(0);
  const boxes = new Array<number>(9).fill(0);
  for (let i = 0; i < SUDOKU_CELLS; i++) {
    const v = grid[i];
    if (!v) continue;
    const bit = 1 << v;
    if ((rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]) & bit) return { count: 0, first: null };
    rows[rowOf(i)] |= bit;
    cols[colOf(i)] |= bit;
    boxes[boxOf(i)] |= bit;
  }

  let count = 0;
  let first: number[] | null = null;

  const step = (): boolean => {
    let best = -1;
    let bestMask = 0;
    let bestSize = 10;
    for (let i = 0; i < SUDOKU_CELLS; i++) {
      if (grid[i]) continue;
      const mask = ALL_DIGITS & ~(rows[rowOf(i)] | cols[colOf(i)] | boxes[boxOf(i)]);
      const size = bitCount(mask);
      if (size < bestSize) {
        best = i;
        bestMask = mask;
        bestSize = size;
        if (size <= 1) break;
      }
    }
    if (best < 0) {
      count++;
      if (!first) first = [...grid];
      return count >= limit;
    }
    if (bestSize === 0) return false;

    const digits = rng ? shuffled(maskDigits(bestMask), rng) : maskDigits(bestMask);
    const r = rowOf(best), c = colOf(best), b = boxOf(best);
    for (const d of digits) {
      const bit = 1 << d;
      grid[best] = d;
      rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
      const done = step();
      rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
      grid[best] = 0;
      if (done) return true;
    }
    return false;
  };

  step();
  return { count, first };
}

/** 0, 1 or 2 — "2" meaning "more than one". */
export function countSolutions(values: readonly number[]): number {
  return search(values, 2).count;
}

export function solve(values: readonly number[]): number[] | null {
  return search(values, 1).first;
}

/** A complete, valid board, random. */
export function randomSolution(rng: Rng = Math.random): number[] {
  const board = search(new Array<number>(SUDOKU_CELLS).fill(0), 1, rng).first;
  if (!board) throw new Error('sudoku: an empty board always has a solution');
  return board;
}

/**
 * A fresh puzzle with exactly one solution. Starting from a full board, clue pairs (a cell and
 * its point mirror) are taken away in random order; a pair goes back whenever the board would
 * no longer have exactly one solution.
 */
export function generatePuzzle(difficulty: SudokuDifficulty, rng: Rng = Math.random): SudokuPuzzle {
  const solution = randomSolution(rng);
  const givens = [...solution];
  const target = SUDOKU_TARGET_GIVENS[difficulty];
  let left = SUDOKU_CELLS;

  const pairs = shuffled(Array.from({ length: 41 }, (_, i) => i), rng);
  for (const i of pairs) {
    if (left <= target) break;
    const j = SUDOKU_CELLS - 1 - i;
    const cells = i === j ? [i] : [i, j];
    for (const k of cells) givens[k] = 0;
    if (countSolutions(givens) === 1) {
      left -= cells.length;
    } else {
      for (const k of cells) givens[k] = solution[k];
    }
  }
  return { difficulty, givens, solution };
}

/** Cells whose value repeats in their row, column or box — a rule break, not a comparison with the solution. */
export function conflictCells(values: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < SUDOKU_CELLS; i++) {
    if (values[i] && PEERS[i].some(p => values[p] === values[i])) out.push(i);
  }
  return out;
}

/** Filled cells that differ from the solution. */
export function wrongCells(puzzle: SudokuPuzzle, values: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < SUDOKU_CELLS; i++) {
    if (values[i] && values[i] !== puzzle.solution[i]) out.push(i);
  }
  return out;
}

export function isSolved(puzzle: SudokuPuzzle, values: readonly number[]): boolean {
  return puzzle.solution.every((v, i) => values[i] === v);
}

/**
 * The cell a hint should reveal: the selected one if it is not right yet; otherwise a wrong
 * cell; otherwise the empty cell with the fewest candidates — the most natural next step.
 * Null when the board is complete and right.
 */
export function hintCell(puzzle: SudokuPuzzle, values: readonly number[], selected: number | null = null): number | null {
  if (selected !== null && values[selected] !== puzzle.solution[selected]) return selected;
  const wrong = wrongCells(puzzle, values);
  if (wrong.length) return wrong[0];
  let best: number | null = null;
  let bestSize = 10;
  for (let i = 0; i < SUDOKU_CELLS; i++) {
    if (values[i]) continue;
    const size = bitCount(candidates(values, i));
    if (size < bestSize) {
      best = i;
      bestSize = size;
    }
  }
  return best;
}

/** How often each digit is on the board; index 0 is unused. */
export function digitCounts(values: readonly number[]): number[] {
  const counts = new Array<number>(10).fill(0);
  for (const v of values) if (v) counts[v]++;
  return counts;
}

export function setValue(values: readonly number[], i: number, value: number): number[] {
  const out = [...values];
  out[i] = value;
  return out;
}

export function toggleNote(notes: readonly number[], i: number, digit: number): number[] {
  const out = [...notes];
  out[i] ^= 1 << digit;
  return out;
}

/** Placing `digit` in `i` clears that cell's notes and the digit from every peer's notes. */
export function placeIntoNotes(notes: readonly number[], i: number, digit: number): number[] {
  const out = [...notes];
  out[i] = 0;
  for (const p of PEERS[i]) out[p] &= ~(1 << digit);
  return out;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
