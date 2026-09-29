export type CrosswordDirection = 'across' | 'down';

export interface PlacedWord {
  entry: number;
  answer: string;   // normalised, A-Z only
  row: number;
  col: number;
  direction: CrosswordDirection;
}

interface Occupancy {
  letters: Map<string, string>;   // 'row,col' → letter
}

const key = (row: number, col: number): string => `${row},${col}`;

/** Every cell a word covers, in order. */
export function cellsOf(word: PlacedWord): { row: number; col: number }[] {
  return [...word.answer].map((_, i) => word.direction === 'across'
    ? { row: word.row, col: word.col + i }
    : { row: word.row + i, col: word.col });
}

function occupancyOf(placed: PlacedWord[]): Occupancy {
  const letters = new Map<string, string>();
  for (const word of placed) {
    cellsOf(word).forEach((cell, i) => letters.set(key(cell.row, cell.col), word.answer[i]));
  }
  return { letters };
}

/**
 * True when `candidate` may join `placed`.
 *
 * Four conditions, all load-bearing:
 *  - it does not share any cell with an already-placed word running in the SAME direction —
 *    otherwise a shorter placed word (e.g. 'OST') could sit strictly inside a longer collinear
 *    candidate (e.g. 'KOSTEN'), putting two clues on one run and making the puzzle unsolvable;
 *  - it crosses at least one existing word (so the grid stays one connected component);
 *  - every shared cell carries the same letter;
 *  - no new cell touches a foreign word sideways, and the cells just before and after the
 *    word are empty — otherwise two words run flush and the reader sees a word that is not
 *    in the clue list.
 */
export function canPlace(placed: PlacedWord[], candidate: PlacedWord): boolean {
  if (placed.length === 0) return true;
  const cells = cellsOf(candidate);

  // a same-direction word may never overlap another same-direction word, even where every
  // overlapped letter matches — that is not a crossing, it is two clues on one collinear run
  const sameDirectionOverlap = placed
    .filter(word => word.direction === candidate.direction)
    .some(word => cellsOf(word).some(wc => cells.some(cc => cc.row === wc.row && cc.col === wc.col)));
  if (sameDirectionOverlap) return false;

  const { letters } = occupancyOf(placed);
  let crossings = 0;

  // the cell before and the cell after must be empty
  const before = candidate.direction === 'across'
    ? key(candidate.row, candidate.col - 1)
    : key(candidate.row - 1, candidate.col);
  const last = cells[cells.length - 1];
  const after = candidate.direction === 'across'
    ? key(last.row, last.col + 1)
    : key(last.row + 1, last.col);
  if (letters.has(before) || letters.has(after)) return false;

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const existing = letters.get(key(cell.row, cell.col));
    if (existing !== undefined) {
      if (existing !== candidate.answer[i]) return false;
      crossings++;
      continue;   // a legitimate crossing may of course have neighbours
    }
    // an empty cell must not touch a foreign word perpendicular to our direction
    const sides = candidate.direction === 'across'
      ? [key(cell.row - 1, cell.col), key(cell.row + 1, cell.col)]
      : [key(cell.row, cell.col - 1), key(cell.row, cell.col + 1)];
    if (sides.some(side => letters.has(side))) return false;
  }

  return crossings > 0;
}
