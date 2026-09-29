/**
 * Bimaru (Battleship solitaire) — pure rules, generator and solver, no DOM.
 *
 * A fleet hides on a square board. Numbers at the edge tell how many cells of each row and
 * column belong to a ship; ships lie straight and never touch, not even diagonally. A few
 * cells are revealed from the start. The generator only hands out boards with exactly ONE
 * solution: it reveals cells until the solver can no longer find a second one.
 *
 * Grids are plain arrays indexed `[row][col]`; nothing here mutates what it is given.
 */

export type BimaruSize = 6 | 8 | 10;
export const BIMARU_SIZES: readonly BimaruSize[] = [6, 8, 10];

/** Ship lengths per board size, longest first. */
export const BIMARU_FLEETS: Record<BimaruSize, readonly number[]> = {
  6: [3, 2, 2, 1, 1, 1],
  8: [4, 3, 3, 2, 2, 1, 1, 1],
  10: [4, 3, 3, 2, 2, 2, 1, 1, 1, 1],
};

export const BIMARU_COLS = 'ABCDEFGHIJ';

/** Cell coordinate as [row, col]. */
export type Coord = readonly [number, number];

/** How a ship cell looks: a lone submarine, one of the four ends, or a middle piece. */
export type Segment = 'single' | 'top' | 'bottom' | 'left' | 'right' | 'middle';

/** What the player has put on a cell. */
export type Mark = 'unknown' | 'water' | 'ship';

export interface BimaruShip {
  readonly len: number;
  readonly r: number;
  readonly c: number;
  readonly horizontal: boolean;
}

/** A cell revealed from the start (or by a hint): water, or the ship segment that lies there. */
export interface BimaruGiven {
  readonly r: number;
  readonly c: number;
  readonly value: 'water' | Segment;
}

export interface BimaruPuzzle {
  readonly size: number;
  readonly fleet: readonly number[];
  /** The one solution. Never shown; backs hints, error check and the solved test. */
  readonly ships: readonly BimaruShip[];
  readonly rowCounts: readonly number[];
  readonly colCounts: readonly number[];
  readonly givens: readonly BimaruGiven[];
}

/** A source of randomness, so tests can pin the generator down. Shaped like `Math.random`. */
export type BimaruRandom = () => number;

export function inBounds(size: number, r: number, c: number): boolean {
  return r >= 0 && r < size && c >= 0 && c < size;
}

export function shipCells(ship: BimaruShip): Coord[] {
  return Array.from({ length: ship.len }, (_, i) => (ship.horizontal ? [ship.r, ship.c + i] : [ship.r + i, ship.c]) as Coord);
}

/** The segment the cell at index `i` of a ship shows. */
function segmentOf(len: number, horizontal: boolean, i: number): Segment {
  if (len === 1) return 'single';
  if (i === 0) return horizontal ? 'left' : 'top';
  if (i === len - 1) return horizontal ? 'right' : 'bottom';
  return 'middle';
}

/** `true` where a ship lies. */
export function shipGrid(size: number, ships: readonly BimaruShip[]): boolean[][] {
  const grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  for (const ship of ships) for (const [r, c] of shipCells(ship)) grid[r][c] = true;
  return grid;
}

/** The segment at (r,c) of a ship grid, or `null` for water. */
export function segmentAt(grid: readonly (readonly boolean[])[], r: number, c: number): Segment | null {
  if (!grid[r][c]) return null;
  const size = grid.length;
  const at = (rr: number, cc: number) => inBounds(size, rr, cc) && grid[rr][cc];
  const up = at(r - 1, c), down = at(r + 1, c), left = at(r, c - 1), right = at(r, c + 1);
  if (left && right) return 'middle';
  if (up && down) return 'middle';
  if (right) return 'left';
  if (left) return 'right';
  if (down) return 'top';
  if (up) return 'bottom';
  return 'single';
}

function lineCounts(grid: readonly (readonly boolean[])[]): { rows: number[]; cols: number[] } {
  const size = grid.length;
  const rows = new Array<number>(size).fill(0);
  const cols = new Array<number>(size).fill(0);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) { rows[r]++; cols[c]++; }
    }
  }
  return { rows, cols };
}

// ---------------------------------------------------------------------------------------------
// Fleet placement
// ---------------------------------------------------------------------------------------------

function fits(grid: boolean[][], ship: BimaruShip): boolean {
  const size = grid.length;
  for (const [r, c] of shipCells(ship)) {
    if (!inBounds(size, r, c)) return false;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (inBounds(size, r + dr, c + dc) && grid[r + dr][c + dc]) return false;
      }
    }
  }
  return true;
}

/** A random fleet in which no two ships touch. Longest ships go first, they are hardest to fit. */
export function randomFleet(size: number, fleet: readonly number[], rng: BimaruRandom = Math.random): BimaruShip[] {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
    const ships: BimaruShip[] = [];
    for (const len of fleet) {
      const options: BimaruShip[] = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          for (const horizontal of len === 1 ? [true] : [true, false]) {
            const ship = { len, r, c, horizontal };
            if (fits(grid, ship)) options.push(ship);
          }
        }
      }
      if (!options.length) break;
      const ship = options[Math.floor(rng() * options.length)];
      ships.push(ship);
      for (const [r, c] of shipCells(ship)) grid[r][c] = true;
    }
    if (ships.length === fleet.length) return ships;
  }
  throw new Error('bimaru fleet could not be placed');
}

// ---------------------------------------------------------------------------------------------
// Solver
// ---------------------------------------------------------------------------------------------

export interface SolveResult {
  /** Solutions found, at most `limit`. */
  readonly solutions: boolean[][][];
  /** True when the search ran out of budget before it could finish. */
  readonly exhausted: boolean;
}

type Placement = { cells: number[]; ring: number[]; segments: Segment[]; horizontal: boolean; r: number };

/**
 * Finds up to `limit` fleets that satisfy the edge counts and every given.
 *
 * Ship-driven backtracking, longest ship first. Ships of equal length are interchangeable, so
 * each one must start at a later placement than the one before it — otherwise every solution
 * would be found once per permutation. `budget` caps the visited nodes; a search that hits it
 * reports `exhausted` and proves nothing.
 */
export function solve(
  size: number,
  fleet: readonly number[],
  rowCounts: readonly number[],
  colCounts: readonly number[],
  givens: readonly BimaruGiven[],
  limit = 2,
  budget = 200_000,
): SolveResult {
  const n = size * size;
  const lengths = [...fleet].sort((a, b) => b - a);

  const givenWater = new Uint8Array(n);
  const givenSegment: (Segment | null)[] = new Array(n).fill(null);
  const givenShips: number[] = [];
  for (const g of givens) {
    const i = g.r * size + g.c;
    if (g.value === 'water') givenWater[i] = 1;
    else { givenSegment[i] = g.value; givenShips.push(i); }
  }

  // every placement of every distinct length, with the ring of cells around it
  const placements = new Map<number, Placement[]>();
  for (const len of new Set(lengths)) {
    const list: Placement[] = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        for (const horizontal of len === 1 ? [true] : [true, false]) {
          const ship = { len, r, c, horizontal };
          const cells = shipCells(ship);
          if (!cells.every(([rr, cc]) => inBounds(size, rr, cc))) continue;
          const own = new Set(cells.map(([rr, cc]) => rr * size + cc));
          const ring = new Set<number>();
          for (const [rr, cc] of cells) {
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const k = (rr + dr) * size + cc + dc;
                if (inBounds(size, rr + dr, cc + dc) && !own.has(k)) ring.add(k);
              }
            }
          }
          list.push({
            cells: [...own],
            ring: [...ring],
            segments: cells.map((_, i) => segmentOf(len, horizontal, i)),
            horizontal,
            r,
          });
        }
      }
    }
    placements.set(len, list);
  }

  const ship = new Uint8Array(n);
  const near = new Int16Array(n);
  const rowRem = [...rowCounts];
  const colRem = [...colCounts];
  const solutions: boolean[][][] = [];
  let nodes = 0;
  let exhausted = false;

  function canUse(p: Placement): boolean {
    const len = p.cells.length;
    for (let i = 0; i < len; i++) {
      const k = p.cells[i];
      if (ship[k] || near[k] || givenWater[k]) return false;
      const g = givenSegment[k];
      if (g && g !== p.segments[i]) return false;
      const r = Math.floor(k / size), c = k % size;
      if (p.horizontal ? colRem[c] < 1 : rowRem[r] < 1) return false;
    }
    if (p.horizontal ? rowRem[p.r] < len : colRem[p.cells[0] % size] < len) return false;
    for (const k of p.ring) if (givenSegment[k] && !ship[k]) return false;
    return true;
  }

  function apply(p: Placement, delta: 1 | -1): void {
    for (const k of p.cells) {
      ship[k] = delta === 1 ? 1 : 0;
      rowRem[Math.floor(k / size)] -= delta;
      colRem[k % size] -= delta;
    }
    for (const k of p.ring) near[k] += delta;
  }

  /** Cheap dead-end test: every line must still have room for what it owes, every given ship cell a way to be covered. */
  function viable(): boolean {
    for (const k of givenShips) {
      if (!ship[k] && (rowRem[Math.floor(k / size)] < 1 || colRem[k % size] < 1)) return false;
    }
    for (let r = 0; r < size; r++) {
      if (rowRem[r] < 0) return false;
      let free = 0;
      for (let c = 0; c < size; c++) {
        const k = r * size + c;
        if (!ship[k] && !near[k] && !givenWater[k]) free++;
      }
      if (free < rowRem[r]) return false;
    }
    for (let c = 0; c < size; c++) {
      if (colRem[c] < 0) return false;
      let free = 0;
      for (let r = 0; r < size; r++) {
        const k = r * size + c;
        if (!ship[k] && !near[k] && !givenWater[k]) free++;
      }
      if (free < colRem[c]) return false;
    }
    return true;
  }

  function search(index: number, from: number): void {
    if (solutions.length >= limit || exhausted) return;
    if (++nodes > budget) { exhausted = true; return; }
    if (index === lengths.length) {
      if (rowRem.some(x => x !== 0) || colRem.some(x => x !== 0)) return;
      if (givenShips.some(k => !ship[k])) return;
      solutions.push(Array.from({ length: size }, (_, r) => Array.from({ length: size }, (_, c) => !!ship[r * size + c])));
      return;
    }
    const len = lengths[index];
    const list = placements.get(len) ?? [];
    for (let p = from; p < list.length; p++) {
      if (!canUse(list[p])) continue;
      apply(list[p], 1);
      if (viable()) {
        const sameNext = index + 1 < lengths.length && lengths[index + 1] === len;
        search(index + 1, sameNext ? p + 1 : 0);
      }
      apply(list[p], -1);
      if (solutions.length >= limit || exhausted) return;
    }
  }

  search(0, 0);
  return { solutions, exhausted };
}

// ---------------------------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------------------------

function givenAt(grid: boolean[][], r: number, c: number): BimaruGiven {
  return { r, c, value: segmentAt(grid, r, c) ?? 'water' };
}

/**
 * A new puzzle with exactly one solution.
 *
 * Starts from one revealed ship segment, then asks the solver for two solutions. While it finds
 * two, it reveals the true content of a cell on which they disagree — that rules out at least
 * one of them. When the search runs out of budget, it reveals a random ship cell, which narrows
 * the search the most. The loop ends as soon as the solver proves the board unique.
 */
export function generatePuzzle(size: BimaruSize, rng: BimaruRandom = Math.random): BimaruPuzzle {
  const fleet = BIMARU_FLEETS[size];
  const ships = randomFleet(size, fleet, rng);
  const grid = shipGrid(size, ships);
  const { rows, cols } = lineCounts(grid);

  const pick = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)];
  const all: Coord[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) all.push([r, c]);
  const shipCoords = all.filter(([r, c]) => grid[r][c]);

  const revealed = new Set<number>();
  const givens: BimaruGiven[] = [];
  const reveal = ([r, c]: Coord) => {
    if (revealed.has(r * size + c)) return;
    revealed.add(r * size + c);
    givens.push(givenAt(grid, r, c));
  };
  reveal(pick(shipCoords));

  for (let round = 0; round < size * size; round++) {
    const { solutions, exhausted } = solve(size, fleet, rows, cols, givens);
    if (solutions.length === 1 && !exhausted) break;
    if (solutions.length >= 2) {
      const differ = all.filter(([r, c]) => solutions[0][r][c] !== solutions[1][r][c] && !revealed.has(r * size + c));
      if (differ.length) { reveal(pick(differ)); continue; }
    }
    const hidden = shipCoords.filter(([r, c]) => !revealed.has(r * size + c));
    reveal(pick(hidden.length ? hidden : all.filter(([r, c]) => !revealed.has(r * size + c))));
  }

  return { size, fleet, ships, rowCounts: rows, colCounts: cols, givens };
}

// ---------------------------------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------------------------------

export type MarkGrid = readonly (readonly Mark[])[];

/** The board a player starts with: all givens filled in, everything else unknown. */
export function initialMarks(puzzle: BimaruPuzzle): Mark[][] {
  const marks = Array.from({ length: puzzle.size }, () => new Array<Mark>(puzzle.size).fill('unknown'));
  for (const g of puzzle.givens) marks[g.r][g.c] = g.value === 'water' ? 'water' : 'ship';
  return marks;
}

/** Tap cycle: unknown → water → ship → unknown. */
export function nextMark(mark: Mark): Mark {
  if (mark === 'unknown') return 'water';
  if (mark === 'water') return 'ship';
  return 'unknown';
}

export function setMark(marks: MarkGrid, r: number, c: number, mark: Mark): Mark[][] {
  return marks.map((row, rr) => (rr === r ? row.map((m, cc) => (cc === c ? mark : m)) : [...row]));
}

/** Fills every unknown cell of one row or column with water. */
export function fillLineWithWater(marks: MarkGrid, line: 'row' | 'col', index: number): Mark[][] {
  return marks.map((row, r) => row.map((m, c) => {
    const inLine = line === 'row' ? r === index : c === index;
    return inLine && m === 'unknown' ? 'water' : m;
  }));
}

/** How many ship marks the player has placed per row and column. */
export function markedCounts(marks: MarkGrid): { rows: number[]; cols: number[] } {
  return lineCounts(marks.map(row => row.map(m => m === 'ship')));
}

/** Solved when the ship marks are exactly the solution; unknown cells count as water. */
export function isSolved(puzzle: BimaruPuzzle, marks: MarkGrid): boolean {
  const grid = shipGrid(puzzle.size, puzzle.ships);
  return marks.every((row, r) => row.every((m, c) => (m === 'ship') === grid[r][c]));
}

/** Cells the player marked, but wrongly. */
export function wrongCells(puzzle: BimaruPuzzle, marks: MarkGrid): Coord[] {
  const grid = shipGrid(puzzle.size, puzzle.ships);
  const out: Coord[] = [];
  marks.forEach((row, r) => row.forEach((m, c) => {
    if ((m === 'ship' && !grid[r][c]) || (m === 'water' && grid[r][c])) out.push([r, c]);
  }));
  return out;
}

/**
 * The cell a hint reveals, or `null` when nothing is left: a wrongly marked cell first, then an
 * unknown ship cell (it teaches more than water), then unknown water.
 */
export function hintCell(puzzle: BimaruPuzzle, marks: MarkGrid, rng: BimaruRandom = Math.random): Coord | null {
  const grid = shipGrid(puzzle.size, puzzle.ships);
  const pick = (list: Coord[]) => (list.length ? list[Math.floor(rng() * list.length)] : null);
  const unknown = (want: boolean): Coord[] => {
    const out: Coord[] = [];
    marks.forEach((row, r) => row.forEach((m, c) => { if (m === 'unknown' && grid[r][c] === want) out.push([r, c]); }));
    return out;
  };
  return pick(wrongCells(puzzle, marks)) ?? pick(unknown(true)) ?? pick(unknown(false));
}

/** The true content of a cell, as a given. */
export function solutionGiven(puzzle: BimaruPuzzle, r: number, c: number): BimaruGiven {
  return givenAt(shipGrid(puzzle.size, puzzle.ships), r, c);
}

/**
 * How a ship mark is drawn, judged from the player's own marks around it: its shape once the
 * neighbours settle it, `null` while they do not (an unknown neighbour could still extend it).
 */
export function markedSegment(marks: MarkGrid, r: number, c: number): Segment | null {
  if (marks[r][c] !== 'ship') return null;
  const size = marks.length;
  const at = (rr: number, cc: number): Mark => (inBounds(size, rr, cc) ? marks[rr][cc] : 'water');
  const up = at(r - 1, c), down = at(r + 1, c), left = at(r, c - 1), right = at(r, c + 1);
  const shipCount = [up, down, left, right].filter(m => m === 'ship').length;
  if (shipCount === 0) return [up, down, left, right].every(m => m === 'water') ? 'single' : null;
  if (shipCount === 1) {
    if (right === 'ship') return 'left';
    if (left === 'ship') return 'right';
    if (down === 'ship') return 'top';
    return 'bottom';
  }
  if ((left === 'ship' && right === 'ship') || (up === 'ship' && down === 'ship')) return 'middle';
  return null;
}

/**
 * Lengths of the ships the player has completed: straight runs of ship marks closed off by water
 * or the edge at both ends, with no ship mark touching them anywhere.
 */
export function completedShips(marks: MarkGrid): number[] {
  const size = marks.length;
  const isShip = (r: number, c: number) => inBounds(size, r, c) && marks[r][c] === 'ship';
  const isClosed = (r: number, c: number) => !inBounds(size, r, c) || marks[r][c] === 'water';
  const out: number[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!isShip(r, c) || isShip(r - 1, c) || isShip(r, c - 1)) continue;
      const horizontal = isShip(r, c + 1);
      if (horizontal && isShip(r + 1, c)) continue;
      const cells: Coord[] = [];
      let rr = r, cc = c;
      while (isShip(rr, cc)) { cells.push([rr, cc]); if (horizontal) cc++; else rr++; }
      const [er, ec] = cells[cells.length - 1];
      const before: Coord = horizontal ? [r, c - 1] : [r - 1, c];
      const after: Coord = horizontal ? [er, ec + 1] : [er + 1, ec];
      if (!isClosed(...before) || !isClosed(...after)) continue;
      // bent or touching runs are not a ship yet
      const own = new Set(cells.map(([a, b]) => a * size + b));
      const touches = cells.some(([a, b]) => {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!own.has((a + dr) * size + b + dc) && isShip(a + dr, b + dc)) return true;
          }
        }
        return false;
      });
      if (!touches) out.push(cells.length);
    }
  }
  return out;
}

/** "A1" … "J10". */
export function coordLabel(r: number, c: number): string {
  return BIMARU_COLS[c] + (r + 1);
}

/** "m:ss", or "h:mm:ss" from one hour on. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
