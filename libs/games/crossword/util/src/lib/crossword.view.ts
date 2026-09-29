import { CrosswordEntry, CrosswordGrid } from '@okr/shared-models';
import { normalizeEntries } from './crossword.normalize';
import { cellsOf } from './crossword.rules';

export interface CellView {
  blocked: boolean;              // true = black square, no input
  letter: string;                // the solution letter; '' when blocked
  number: number | undefined;    // the clue number drawn small in the corner
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
