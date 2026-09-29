/**
 * Schiffli versenken (Battleship) — pure rules and computer opponent, no DOM.
 *
 * Ported from the standalone prototype (`battleship.js`, 2026-09). One deliberate change: the
 * prototype mutated boards in place, which a signal store cannot observe. Here `placeShip` and
 * `fire` return a NEW board and never touch the one passed in.
 */

export const BATTLESHIP_SIZE = 10;
export const BATTLESHIP_COLS = 'ABCDEFGHIJ';

/** Ship ids double as i18n keys (`ship.<id>`); the display name is never stored. */
export type ShipId = 'carrier' | 'battleship' | 'cruiser' | 'submarine' | 'destroyer';

export interface ShipSpec {
  readonly id: ShipId;
  readonly len: number;
}

/** Placed in this order during setup. */
export const FLEET: readonly ShipSpec[] = [
  { id: 'carrier', len: 5 },
  { id: 'battleship', len: 4 },
  { id: 'cruiser', len: 3 },
  { id: 'submarine', len: 3 },
  { id: 'destroyer', len: 2 },
];

/** Cell coordinate as [row, col]. */
export type Coord = readonly [number, number];

export interface BoardCell {
  /** Index into `ships`, or -1 for water. */
  readonly ship: number;
  readonly shot: boolean;
}

export interface Ship {
  readonly id: ShipId;
  readonly len: number;
  readonly cells: readonly Coord[];
  readonly hits: number;
  readonly horizontal: boolean;
}

export interface Board {
  readonly cells: readonly (readonly BoardCell[])[];
  readonly ships: readonly Ship[];
}

export type ShotResult = 'repeat' | 'miss' | 'hit' | 'sunk';

export interface FireOutcome {
  readonly board: Board;
  readonly result: ShotResult;
  /** The ship hit or sunk; absent for water or a repeat. */
  readonly ship?: Ship;
  readonly gameOver: boolean;
}

/** What a shooter knows about a cell. `blocked` = unshot water next to a sunk ship (no-touch rule only). */
export type CellKnowledge = 'unknown' | 'miss' | 'hit' | 'sunk' | 'blocked';

export type AiLevel = 'easy' | 'normal' | 'hard';

export function createBoard(): Board {
  return {
    cells: Array.from({ length: BATTLESHIP_SIZE }, () =>
      Array.from({ length: BATTLESHIP_SIZE }, () => ({ ship: -1, shot: false })),
    ),
    ships: [],
  };
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < BATTLESHIP_SIZE && c >= 0 && c < BATTLESHIP_SIZE;
}

export function shipCells(r: number, c: number, len: number, horizontal: boolean): Coord[] {
  const out: Coord[] = [];
  for (let i = 0; i < len; i++) out.push(horizontal ? [r, c + i] : [r + i, c]);
  return out;
}

/** True if a ship of `len` fits at (r,c). Without `allowTouch`, ships may not touch — not even diagonally. */
export function canPlace(board: Board, r: number, c: number, len: number, horizontal: boolean, allowTouch: boolean): boolean {
  for (const [rr, cc] of shipCells(r, c, len, horizontal)) {
    if (!inBounds(rr, cc) || board.cells[rr][cc].ship !== -1) return false;
    if (!allowTouch) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = rr + dr;
          const nc = cc + dc;
          if (inBounds(nr, nc) && board.cells[nr][nc].ship !== -1) return false;
        }
      }
    }
  }
  return true;
}

/** Places a ship without validating the spot; check `canPlace` first. */
export function placeShip(board: Board, spec: ShipSpec, r: number, c: number, horizontal: boolean): Board {
  const index = board.ships.length;
  const cells = shipCells(r, c, spec.len, horizontal);
  const own = new Set(cells.map(([rr, cc]) => rr * BATTLESHIP_SIZE + cc));
  return {
    cells: board.cells.map((row, rr) =>
      row.map((cell, cc) => (own.has(rr * BATTLESHIP_SIZE + cc) ? { ...cell, ship: index } : cell)),
    ),
    ships: [...board.ships, { id: spec.id, len: spec.len, cells, hits: 0, horizontal }],
  };
}

export function randomFleet(allowTouch: boolean, rng: () => number = Math.random): Board {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let board = createBoard();
    let ok = true;
    for (const spec of FLEET) {
      const options: [number, number, boolean][] = [];
      for (let r = 0; r < BATTLESHIP_SIZE; r++) {
        for (let c = 0; c < BATTLESHIP_SIZE; c++) {
          for (const h of [true, false]) {
            if (canPlace(board, r, c, spec.len, h, allowTouch)) options.push([r, c, h]);
          }
        }
      }
      if (!options.length) {
        ok = false;
        break;
      }
      const [r, c, h] = options[Math.floor(rng() * options.length)];
      board = placeShip(board, spec, r, c, h);
    }
    if (ok) return board;
  }
  throw new Error('fleet could not be placed');
}

export function isSunk(ship: Ship): boolean {
  return ship.hits >= ship.len;
}

export function allSunk(board: Board): boolean {
  return board.ships.length > 0 && board.ships.every(isSunk);
}

export function fire(board: Board, r: number, c: number): FireOutcome {
  const cell = board.cells[r][c];
  if (cell.shot) return { board, result: 'repeat', gameOver: false };

  const cells = board.cells.map((row, rr) =>
    rr === r ? row.map((x, cc) => (cc === c ? { ...x, shot: true } : x)) : row,
  );
  if (cell.ship === -1) return { board: { cells, ships: board.ships }, result: 'miss', gameOver: false };

  const ship = { ...board.ships[cell.ship], hits: board.ships[cell.ship].hits + 1 };
  const ships = board.ships.map((s, i) => (i === cell.ship ? ship : s));
  const next: Board = { cells, ships };
  return isSunk(ship)
    ? { board: next, result: 'sunk', ship, gameOver: allSunk(next) }
    : { board: next, result: 'hit', ship, gameOver: false };
}

/** Cells around a ship (8-neighbourhood) that are not part of it. */
export function surroundingCells(ship: Ship): Coord[] {
  const own = new Set(ship.cells.map(([r, c]) => r * BATTLESHIP_SIZE + c));
  const out = new Map<number, Coord>();
  for (const [r, c] of ship.cells) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        const key = nr * BATTLESHIP_SIZE + nc;
        if (inBounds(nr, nc) && !own.has(key)) out.set(key, [nr, nc]);
      }
    }
  }
  return [...out.values()];
}

/** What a shooter knows about `board`. Without `allowTouch`, water around a sunk ship is `blocked`. */
export function knowledge(board: Board, allowTouch: boolean): CellKnowledge[][] {
  const k = board.cells.map(row =>
    row.map((cell): CellKnowledge => {
      if (!cell.shot) return 'unknown';
      if (cell.ship === -1) return 'miss';
      return isSunk(board.ships[cell.ship]) ? 'sunk' : 'hit';
    }),
  );
  if (!allowTouch) {
    for (const ship of board.ships) {
      if (!isSunk(ship)) continue;
      for (const [r, c] of surroundingCells(ship)) if (k[r][c] === 'unknown') k[r][c] = 'blocked';
    }
  }
  return k;
}

function pickRandom<T>(list: readonly T[], rng: () => number): T {
  return list[Math.floor(rng() * list.length)];
}

/**
 * The computer's next shot at `board`, or `null` when nothing is left to shoot at.
 *  - easy   — a random unknown cell
 *  - normal — random while hunting, probability-driven once it has an open hit
 *  - hard   — probability density over every placement the remaining ships could still have
 */
export function aiChooseShot(board: Board, level: AiLevel, allowTouch: boolean, rng: () => number = Math.random): Coord | null {
  const k = knowledge(board, allowTouch);
  const unknown: Coord[] = [];
  const hits: Coord[] = [];
  for (let r = 0; r < BATTLESHIP_SIZE; r++) {
    for (let c = 0; c < BATTLESHIP_SIZE; c++) {
      if (k[r][c] === 'unknown') unknown.push([r, c]);
      else if (k[r][c] === 'hit') hits.push([r, c]);
    }
  }
  if (!unknown.length) return null;
  if (level === 'easy') return pickRandom(unknown, rng);
  if (level === 'normal' && hits.length === 0) return pickRandom(unknown, rng);

  const density = Array.from({ length: BATTLESHIP_SIZE }, () => new Array<number>(BATTLESHIP_SIZE).fill(0));
  const remaining = board.ships.filter(s => !isSunk(s)).map(s => s.len);
  for (const len of remaining) {
    for (let r = 0; r < BATTLESHIP_SIZE; r++) {
      for (let c = 0; c < BATTLESHIP_SIZE; c++) {
        for (const h of [true, false]) {
          if (len === 1 && !h) continue;
          const cells = shipCells(r, c, len, h);
          let valid = true;
          let cover = 0;
          for (const [rr, cc] of cells) {
            if (!inBounds(rr, cc)) { valid = false; break; }
            const s = k[rr][cc];
            if (s === 'hit') cover++;
            else if (s !== 'unknown') { valid = false; break; }
          }
          if (!valid) continue;
          // target mode: once there is an open hit, only placements through it count
          if (hits.length && cover === 0) continue;
          const weight = Math.pow(25, cover);
          for (const [rr, cc] of cells) if (k[rr][cc] === 'unknown') density[rr][cc] += weight;
        }
      }
    }
  }

  let best: Coord[] = [];
  let max = 0;
  for (const [r, c] of unknown) {
    const d = density[r][c];
    if (d > max) { max = d; best = [[r, c]]; }
    else if (d === max && d > 0) best.push([r, c]);
  }
  return best.length ? pickRandom(best, rng) : pickRandom(unknown, rng);
}

/** "A1" … "J10". */
export function coordLabel(r: number, c: number): string {
  return BATTLESHIP_COLS[c] + (r + 1);
}
