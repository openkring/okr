import { ZipCell, ZipPuzzle, areAdjacent, cellKey, checkpointNumberAt, isInsideBoard, isSameCell } from './zip.model';

/** Why a candidate move was refused. `'ok'` means it may be played. */
export type ZipMoveVerdict = 'ok' | 'off-board' | 'not-adjacent' | 'already-visited' | 'out-of-order' | 'finished';

/** The path a fresh board starts with: the first checkpoint, already placed. */
export function startPath(puzzle: ZipPuzzle): ZipCell[] {
  return puzzle.checkpoints.length > 0 ? [puzzle.checkpoints[0]] : [];
}

/**
 * Judges one candidate step from the head of `path`.
 *
 * The two rules of the game, in the order a player runs into them: the step must be orthogonal
 * and onto a cell the path has not used, and it may only land on a numbered cell when that
 * number is the next one due. Reaching the final number ends the path — there is nothing left
 * to extend, which is why a complete path cannot overshoot it.
 */
export function judgeMove(path: ZipCell[], cell: ZipCell, puzzle: ZipPuzzle): ZipMoveVerdict {
  if (!isInsideBoard(cell, puzzle.size)) {
    return 'off-board';
  }

  const head = path[path.length - 1];
  if (head !== undefined && isSameCell(head, puzzle.checkpoints[puzzle.checkpoints.length - 1])) {
    return 'finished';
  }

  if (head !== undefined && !areAdjacent(head, cell)) {
    return 'not-adjacent';
  }

  if (path.some(visited => isSameCell(visited, cell))) {
    return 'already-visited';
  }

  const number = checkpointNumberAt(cell, puzzle.checkpoints);
  if (number !== undefined && number !== reachedCheckpoints(path, puzzle) + 1) {
    return 'out-of-order';
  }

  return 'ok';
}

/** Convenience over `judgeMove` for the common "may I?" question. */
export function canExtend(path: ZipCell[], cell: ZipCell, puzzle: ZipPuzzle): boolean {
  return judgeMove(path, cell, puzzle) === 'ok';
}

/** How many numbered cells the path has collected so far. */
export function reachedCheckpoints(path: ZipCell[], puzzle: ZipPuzzle): number {
  return path.filter(cell => checkpointNumberAt(cell, puzzle.checkpoints) !== undefined).length;
}

/**
 * True when the board is finished: every cell used exactly once, every number collected, and
 * the path resting on the last of them. `judgeMove` already enforces the ordering, so this only
 * has to confirm the path is complete rather than re-walk the sequence.
 */
export function isSolved(path: ZipCell[], puzzle: ZipPuzzle): boolean {
  if (path.length !== puzzle.size * puzzle.size) {
    return false;
  }
  if (new Set(path.map(cellKey)).size !== path.length) {
    return false;
  }
  if (reachedCheckpoints(path, puzzle) !== puzzle.checkpoints.length) {
    return false;
  }
  return isSameCell(path[path.length - 1], puzzle.checkpoints[puzzle.checkpoints.length - 1]);
}

/**
 * True when dragging onto `cell` should rub out the last step instead of drawing a new one —
 * i.e. the pointer moved back onto the cell the path came from.
 */
export function isBacktrack(path: ZipCell[], cell: ZipCell): boolean {
  return path.length >= 2 && isSameCell(path[path.length - 2], cell);
}

/** How many leading cells `path` and `solution` agree on. */
export function commonPrefixLength(path: ZipCell[], solution: ZipCell[]): number {
  let length = 0;
  while (length < path.length && length < solution.length && isSameCell(path[length], solution[length])) {
    length++;
  }
  return length;
}

/**
 * The path after one hint: rewound to wherever it last agreed with the stored solution, then
 * advanced by a single cell along it.
 *
 * A player who has wandered off gets their wrong moves taken back — which is the help they
 * actually need, since a diverged path cannot be continued into the solution — and one correct
 * cell handed to them. On a path that is already a prefix of the solution nothing is rewound
 * and it simply grows by one. Returns the path unchanged once it is complete.
 */
export function applyHint(path: ZipCell[], puzzle: ZipPuzzle): ZipCell[] {
  const shared = commonPrefixLength(path, puzzle.solution);
  if (shared >= puzzle.solution.length) {
    return path;
  }
  return [...puzzle.solution.slice(0, shared), puzzle.solution[shared]];
}
