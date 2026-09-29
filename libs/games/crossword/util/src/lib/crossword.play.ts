import { CrosswordEntry } from '@okr/shared-models';
import { normalizeAnswer } from './crossword.normalize';
import { CrosswordDirection } from './crossword.rules';
import { CellPos, CellView, cellAt, runOf } from './crossword.view';

/** The player's cursor: a cell plus the direction typing advances in. */
export interface CrosswordCursor extends CellPos {
  direction: CrosswordDirection;
}

/**
 * The grid letter a typed character stands for, or `undefined` when it stands for none.
 *
 * Goes through `normalizeAnswer`, the same function that built the solution, so a key the grid
 * spells as two cells (Ä → AE, ß → SS) types its first letter: the player presses Ü, gets U, and
 * the next keystroke (E) completes the digraph. Accents fold the same way (É → E). A plain
 * `/^[A-Z]$/` test here silently swallowed every umlaut on a German keyboard.
 */
export function inputLetter(raw: string): string | undefined {
  // NFC first: a decomposed Ü (U + combining diaeresis) would otherwise leave only the mark
  const letter = normalizeAnswer(raw.normalize('NFC').slice(-1)).charAt(0);
  return letter === '' ? undefined : letter;
}

/** True when some answer contains a letter the grid spells as two cells (Ä, Ö, Ü, ß). */
export function hasExpandedLetters(entries: CrosswordEntry[]): boolean {
  return entries.some(entry => /[ÄÖÜäöüßẞ]/.test(entry.answer));
}

/**
 * The direction a tap on (row, col) selects. Tapping the already-selected cell flips direction
 * (across ↔ down) when both directions run through it; otherwise the current direction is kept
 * where it still applies, and falls back to whichever direction has a run there.
 */
export function nextDirection(map: CellView[][], current: CrosswordCursor | undefined, row: number, col: number): CrosswordDirection {
  const across = runOf(map, row, col, 'across').length > 1;
  const down = runOf(map, row, col, 'down').length > 1;
  if (current?.row === row && current.col === col && across && down) {
    return current.direction === 'across' ? 'down' : 'across';
  }
  if (current?.direction === 'across' && across) return 'across';
  if (current?.direction === 'down' && down) return 'down';
  return across ? 'across' : 'down';
}

/**
 * The cell `offset` steps along the cursor's run (+1 next, -1 previous), or `undefined` at either
 * end of the run — the cursor then stays where it is.
 */
export function stepInRun(map: CellView[][], cursor: CrosswordCursor, offset: number): CrosswordCursor | undefined {
  const run = runOf(map, cursor.row, cursor.col, cursor.direction);
  const index = run.findIndex(c => c.row === cursor.row && c.col === cursor.col);
  if (index === -1) return undefined;
  const target = run[index + offset];
  return target ? { ...target, direction: cursor.direction } : undefined;
}

/**
 * True once every unblocked cell holds its solution letter. Requires at least one unblocked cell
 * — an empty or all-blocked grid must never read as solved, or the page would show the solved
 * banner over a board with nothing on it.
 */
export function isSolved(map: CellView[][], filled: Map<string, string>): boolean {
  let hasUnblockedCell = false;
  for (let r = 0; r < map.length; r++) {
    for (let c = 0; c < map[r].length; c++) {
      const cell = map[r][c];
      if (cell.blocked) continue;
      hasUnblockedCell = true;
      if (filled.get(`${r},${c}`) !== cell.letter) return false;
    }
  }
  return hasUnblockedCell;
}

/** How many filled cells hold a wrong letter. Keys outside `map` or on a blocked cell never count. */
export function countWrong(map: CellView[][], filled: Map<string, string>): number {
  let wrong = 0;
  for (const [key, letter] of filled) {
    const [row, col] = key.split(',').map(Number);
    const cell = cellAt(map, row, col);
    if (cell && !cell.blocked && letter !== cell.letter) wrong++;
  }
  return wrong;
}

/**
 * The finish stamp after an edit, from the solved state on either side of it: solving stamps
 * `now` (freezing the clock), un-solving a solved board (overtyping a correct cell) clears the
 * stamp again, and anything else leaves it as it was.
 */
export function finishedAtAfterEdit(wasSolved: boolean, nowSolved: boolean, finishedAt: number | undefined, now: number): number | undefined {
  if (nowSolved && !wasSolved) return now;
  if (!nowSolved && wasSolved) return undefined;
  return finishedAt;
}
