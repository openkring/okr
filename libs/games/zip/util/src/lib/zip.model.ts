/**
 * A single square of the board, addressed by its zero-based row and column.
 * Rows grow downwards, columns to the right — the same orientation the CSS grid uses.
 */
export type ZipCell = {
  row: number;
  col: number;
};

/**
 * A generated, guaranteed-solvable board.
 *
 * `solution` is a Hamiltonian path: it visits every one of `size * size` cells exactly once,
 * each step orthogonal to the previous one. `checkpoints` are the numbered circles the player
 * sees, in ascending order; every checkpoint lies on `solution`, `checkpoints[0]` is its first
 * cell and the last checkpoint its last cell. The player never sees `solution` — it backs the
 * hint, nothing else, and a player may legitimately solve the board along a different path.
 */
export type ZipPuzzle = {
  size: number;
  checkpoints: ZipCell[];
  solution: ZipCell[];
};

/** What the two in-page controls produce. Always run it through `clampZipConfig` first. */
export type ZipConfig = {
  /** Edge length of the square board. */
  size: number;
  /** How many numbered checkpoints to place. */
  count: number;
};

/** A source of randomness, so tests can pin the generator down. Shaped like `Math.random`. */
export type ZipRandom = () => number;

/** Addresses a cell as a string, for set/map membership. */
export function cellKey(cell: ZipCell): string {
  return `${cell.row},${cell.col}`;
}

/** True when both cells address the same square. */
export function isSameCell(a: ZipCell, b: ZipCell): boolean {
  return a.row === b.row && a.col === b.col;
}

/** True when the two cells share an edge — diagonals are not adjacent. */
export function areAdjacent(a: ZipCell, b: ZipCell): boolean {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

/** True when the cell lies inside a `size * size` board. */
export function isInsideBoard(cell: ZipCell, size: number): boolean {
  return cell.row >= 0 && cell.col >= 0 && cell.row < size && cell.col < size;
}

/** The (at most four) orthogonal neighbours of `cell` that lie inside the board. */
export function neighbours(cell: ZipCell, size: number): ZipCell[] {
  const candidates: ZipCell[] = [
    { row: cell.row - 1, col: cell.col },
    { row: cell.row + 1, col: cell.col },
    { row: cell.row, col: cell.col - 1 },
    { row: cell.row, col: cell.col + 1 },
  ];
  return candidates.filter(candidate => isInsideBoard(candidate, size));
}

/**
 * The 1-based number drawn on `cell`, or `undefined` when it carries no checkpoint.
 * `checkpoints` is ascending, so the array index plus one is the number the player sees.
 */
export function checkpointNumberAt(cell: ZipCell, checkpoints: ZipCell[]): number | undefined {
  const index = checkpoints.findIndex(checkpoint => isSameCell(checkpoint, cell));
  return index === -1 ? undefined : index + 1;
}
