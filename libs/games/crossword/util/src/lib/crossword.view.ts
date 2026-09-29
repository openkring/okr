import { CrosswordEntry, CrosswordGrid } from '@okr/shared-models';
import { normalizeEntries } from './crossword.normalize';
import { CrosswordDirection, cellsOf } from './crossword.rules';

export interface CellView {
  blocked: boolean;              // true = black square, no input
  letter: string;                // the solution letter; '' when blocked
  number: number | undefined;    // the clue number drawn small in the corner
}

export interface CellPos {
  row: number;
  col: number;
}

/**
 * The grid as a dense rows × cols matrix the renderer can iterate.
 *
 * A placement whose `entry` no longer exists is skipped rather than thrown on: a topic edited
 * down while `gridStale` was ignored must still render.
 */
export function buildCellMap(grid: CrosswordGrid, entries: CrosswordEntry[]): CellView[][] {
  const map: CellView[][] = Array.from({ length: grid.rows }, () =>
    Array.from({ length: grid.cols }, () => ({ blocked: true, letter: '', number: undefined })));

  for (const placement of grid.placements) {
    const entry = entries[placement.entry];
    if (!entry) continue;
    const answer = normalizeEntries([entry]).usable[0]?.answer;
    if (!answer) continue;

    cellsOf({ ...placement, answer }).forEach((cell, i) => {
      if (cell.row >= grid.rows || cell.col >= grid.cols) return;
      const target = map[cell.row][cell.col];
      target.blocked = false;
      target.letter = answer[i];
      if (i === 0) target.number = placement.number;
    });
  }

  return map;
}

/** The cell at (row, col), or `undefined` when either coordinate is outside `map` — the one safe
 * way to index a cell whose origin is not already known to be in bounds (a clue's placement, a
 * stale saved selection). */
export function cellAt(map: CellView[][], row: number, col: number): CellView | undefined {
  return map[row]?.[col];
}

/**
 * The unbroken run of cells starting at (row, col) and continuing in `direction`, up to (and not
 * including) the next blocked cell or grid edge. Empty when (row, col) itself is out of bounds
 * or blocked.
 */
export function runFrom(map: CellView[][], row: number, col: number, direction: CrosswordDirection): CellPos[] {
  const cells: CellPos[] = [];
  let r = row;
  let c = col;
  let cell = cellAt(map, r, c);
  while (cell && !cell.blocked) {
    cells.push({ row: r, col: c });
    if (direction === 'across') c++; else r++;
    cell = cellAt(map, r, c);
  }
  return cells;
}

/**
 * Walks back to the first cell of the run (row, col) sits inside, in `direction`. Returns
 * (row, col) itself when it is out of bounds or blocked — callers must check `cellAt`/`runOf`
 * before trusting the result to index `map`.
 */
export function runStart(map: CellView[][], row: number, col: number, direction: CrosswordDirection): CellPos {
  let r = row;
  let c = col;
  for (;;) {
    const pr = direction === 'across' ? r : r - 1;
    const pc = direction === 'across' ? c - 1 : c;
    const prev = cellAt(map, pr, pc);
    if (!prev || prev.blocked) break;
    r = pr;
    c = pc;
  }
  return { row: r, col: c };
}

/**
 * The whole run (row, col) sits inside, in `direction` — from its first cell to its last. Empty
 * when (row, col) is out of bounds or blocked, so it is safe to call with an unvalidated cell
 * (e.g. a clue placement whose entry was since removed).
 */
export function runOf(map: CellView[][], row: number, col: number, direction: CrosswordDirection): CellPos[] {
  const cell = cellAt(map, row, col);
  if (!cell || cell.blocked) return [];
  const start = runStart(map, row, col, direction);
  return runFrom(map, start.row, start.col, direction);
}
