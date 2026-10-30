/*
 * Murdoku rules, pure. A floor plan is an n×n grid (n = 4, 5 or 6), cells numbered row by row.
 * It is split into rooms and holds furniture; n people stand on it — one victim, the rest suspects.
 *
 *  - every row and every column holds exactly one person;
 *  - nobody stands on a table, a plant or a bookshelf;
 *  - every statement («Aussage») is true;
 *  - the killer is the only other person in the victim's room.
 *
 * `generatePuzzle(difficulty, seed)` is deterministic: the same seed always deals the same case,
 * so a saved game only needs the seed and the player's moves (see `murdoku.storage.ts`).
 * Every dealt case is proven to have exactly one placement by `solve()`.
 */

export type MurdokuDifficulty = 'easy' | 'medium' | 'hard';
export const MURDOKU_DIFFICULTIES: readonly MurdokuDifficulty[] = ['easy', 'medium', 'hard'];

export type Furniture = 'chair' | 'rug' | 'bed' | 'table' | 'plant' | 'shelf';
/** Furniture a person may stand (or sit, or lie) on. */
export const WALKABLE: readonly Furniture[] = ['chair', 'rug', 'bed'];
/** Furniture that blocks its square. */
export const BLOCKING: readonly Furniture[] = ['table', 'plant', 'shelf'];
export const FURNITURE: readonly Furniture[] = [...WALKABLE, ...BLOCKING];

/** Room ids; each has an i18n label under `room.<id>`. */
export const ROOM_IDS = [
  'kitchen', 'library', 'greenhouse', 'workshop', 'music', 'pantry', 'sunroom', 'bedroom',
  'office', 'laundry', 'gallery', 'cellar', 'studio', 'chapel', 'salon', 'nursery',
] as const;
export type RoomId = typeof ROOM_IDS[number];

/** First names, one per initial, so the tokens on the board stay unambiguous. */
export const PERSON_NAMES: readonly string[] = [
  'Ada', 'Cyril', 'Dora', 'Elio', 'Fenna', 'Gus', 'Hedda', 'Ivo', 'Juno', 'Kasimir', 'Lotte', 'Milo',
  'Nadia', 'Otto', 'Pia', 'Quentin', 'Rosa', 'Silas', 'Tilda', 'Ugo', 'Vera', 'Wim', 'Xenia', 'Yusuf', 'Zora',
];

export type ClueType =
  | 'room' | 'notRoom' | 'on' | 'beside' | 'bare' | 'edge' | 'inner' | 'row' | 'col'
  | 'alone' | 'company' | 'north' | 'west';

/**
 * One statement about person `p`. `a` is the argument: a room index (`room`, `notRoom`),
 * a furniture type (`on`, `beside`), a row or column index (`row`, `col`) or another person
 * (`north`, `west`); the other types take none.
 */
export type Clue = { p: number; t: ClueType; a?: number | Furniture };

export type MurdokuPuzzle = {
  difficulty: MurdokuDifficulty;
  seed: number;
  n: number;
  /** Room index per cell. */
  rooms: number[];
  roomIds: RoomId[];
  furniture: (Furniture | null)[];
  names: string[];
  victim: number;
  killer: number;
  /** Cell per person — the one and only placement. */
  solution: number[];
  clues: Clue[];
};

/** Placement per person; null while not yet placed. */
export type Placement = (number | null)[];

/** A random source in [0, 1). */
export type Rng = () => number;

type Weights = Record<ClueType, number>;
type Level = { n: number; rooms: number; density: number; prune: number; weights: Weights };

/**
 * Per level: board size, room count, how much furniture, how hard clues are pruned once the case
 * is unique (1 = down to a minimal set), and how often each kind of statement is drawn.
 */
const LEVELS: Record<MurdokuDifficulty, Level> = {
  easy: { n: 4, rooms: 4, density: 0.35, prune: 0.35,
    weights: { room: 3, notRoom: 0.6, on: 3, beside: 2, bare: 1, edge: 1, inner: 1, row: 1.2, col: 1.2, alone: 1, company: 0.5, north: 0, west: 0 } },
  medium: { n: 5, rooms: 5, density: 0.4, prune: 0.8,
    weights: { room: 2, notRoom: 1.5, on: 2, beside: 3, bare: 1, edge: 1, inner: 1, row: 0.6, col: 0.6, alone: 1.5, company: 1, north: 1, west: 1 } },
  hard: { n: 6, rooms: 6, density: 0.42, prune: 1,
    weights: { room: 1, notRoom: 2.5, on: 2, beside: 3, bare: 1, edge: 1, inner: 1, row: 0.25, col: 0.25, alone: 2, company: 1, north: 1.5, west: 1.5 } },
};

export const boardSize = (difficulty: MurdokuDifficulty): number => LEVELS[difficulty].n;

const UNARY: ReadonlySet<ClueType> = new Set<ClueType>(['room', 'notRoom', 'on', 'beside', 'bare', 'edge', 'inner', 'row', 'col']);
const COLS = 'ABCDEF';

/** Deterministic PRNG (mulberry32). */
export function seededRng(seed: number): Rng {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
const pick = <T>(items: readonly T[], rng: Rng): T => items[Math.floor(rng() * items.length)];

function shuffle<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function weightedPick<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T | null {
  let total = 0;
  for (const it of items) total += weight(it);
  if (total <= 0) return null;
  let x = rng() * total;
  for (const it of items) {
    x -= weight(it);
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

export const rowOf = (cell: number, n: number): number => Math.floor(cell / n);
export const colOf = (cell: number, n: number): number => cell % n;
/** «B3»: column letter, row number. */
export const coordLabel = (cell: number, n: number): string => COLS[colOf(cell, n)] + (rowOf(cell, n) + 1);
export const colLabel = (col: number): string => COLS[col];
export const isBlocking = (f: Furniture | null): boolean => f !== null && BLOCKING.includes(f);

/** The up to four cells sharing an edge with `cell`. */
export function neighbours(cell: number, n: number): number[] {
  const r = rowOf(cell, n), c = colOf(cell, n), out: number[] = [];
  if (r > 0) out.push(cell - n);
  if (r < n - 1) out.push(cell + n);
  if (c > 0) out.push(cell - 1);
  if (c < n - 1) out.push(cell + 1);
  return out;
}

/** Grows `count` contiguous rooms from random seeds, keeping their sizes roughly even. */
export function makeRooms(n: number, count: number, rng: Rng): number[] | null {
  for (let attempt = 0; attempt < 500; attempt++) {
    const grid = new Array<number>(n * n).fill(-1);
    const size = new Array<number>(count).fill(1);
    shuffle(range(n * n), rng).slice(0, count).forEach((cell, i) => (grid[cell] = i));
    let left = n * n - count;
    while (left > 0) {
      const front: [number, number][] = [];
      for (let c = 0; c < n * n; c++) {
        if (grid[c] !== -1) continue;
        for (const d of neighbours(c, n)) if (grid[d] !== -1) front.push([c, grid[d]]);
      }
      let choice: [number, number];
      if (rng() < 0.6) {
        const smallest = Math.min(...front.map(f => size[f[1]]));
        choice = pick(front.filter(f => size[f[1]] === smallest), rng);
      } else {
        choice = pick(front, rng);
      }
      grid[choice[0]] = choice[1];
      size[choice[1]]++;
      left--;
    }
    if (Math.min(...size) >= 2 && Math.max(...size) <= Math.ceil((n * n) / count) + 3) return grid;
  }
  return null;
}

type World = Omit<MurdokuPuzzle, 'clues' | 'difficulty' | 'seed'>;

function buildWorld(level: Level, rng: Rng): World | null {
  const n = level.n;
  const rooms = makeRooms(n, level.rooms, rng);
  if (!rooms) return null;

  let solution: number[] | null = null;
  let victim = 0, killer = 0;
  for (let attempt = 0; attempt < 200 && !solution; attempt++) {
    const cols = shuffle(range(n), rng), rows = shuffle(range(n), rng);
    const cells = rows.map(r => r * n + cols[r]);
    const perRoom = new Map<number, number>();
    for (const c of cells) perRoom.set(rooms[c], (perRoom.get(rooms[c]) ?? 0) + 1);
    const pairs = [...perRoom].filter(([, k]) => k === 2).map(([room]) => room);
    if (!pairs.length) continue;
    const room = pick(pairs, rng);
    const two = shuffle(range(n).filter(p => rooms[cells[p]] === room), rng);
    solution = cells;
    victim = two[0];
    killer = two[1];
  }
  if (!solution) return null;

  const occupied = new Set(solution);
  const furniture: (Furniture | null)[] = new Array(n * n).fill(null);
  let beds = 0;
  for (let c = 0; c < n * n; c++) {
    if (rng() >= level.density) continue;
    const f = occupied.has(c)
      ? weightedPick(WALKABLE, x => (x === 'bed' ? (beds < 1 ? 0.8 : 0) : x === 'chair' ? 2 : 1.4), rng)
      : weightedPick(FURNITURE, x => ({ chair: 1.1, rug: 0.7, bed: beds < 1 ? 0.5 : 0, table: 1.4, plant: 1.3, shelf: 1 })[x], rng);
    if (f === 'bed') beds++;
    furniture[c] = f;
  }

  return {
    n, rooms, furniture, solution, victim, killer,
    roomIds: shuffle([...ROOM_IDS], rng).slice(0, level.rooms),
    names: shuffle([...PERSON_NAMES], rng).slice(0, n),
  };
}

type Board = Pick<MurdokuPuzzle, 'n' | 'rooms' | 'furniture' | 'victim'>;

function holdsAt(clue: Clue, cell: number, b: Board): boolean {
  const n = b.n, r = rowOf(cell, n), c = colOf(cell, n);
  const edge = r === 0 || c === 0 || r === n - 1 || c === n - 1;
  switch (clue.t) {
    case 'room': return b.rooms[cell] === clue.a;
    case 'notRoom': return b.rooms[cell] !== clue.a;
    case 'on': return b.furniture[cell] === clue.a;
    case 'beside': return neighbours(cell, n).some(d => b.furniture[d] === clue.a);
    case 'bare': return b.furniture[cell] === null;
    case 'edge': return edge;
    case 'inner': return !edge;
    case 'row': return r === clue.a;
    case 'col': return c === clue.a;
    default: return false;
  }
}

function holdsAll(clue: Clue, cells: readonly number[], b: Board): boolean {
  const cell = cells[clue.p];
  switch (clue.t) {
    case 'alone': return cells.every((d, q) => q === clue.p || b.rooms[d] !== b.rooms[cell]);
    case 'company': return cells.some((d, q) => q !== clue.p && b.rooms[d] === b.rooms[cell]);
    case 'north': return rowOf(cell, b.n) < rowOf(cells[clue.a as number], b.n);
    case 'west': return colOf(cell, b.n) < colOf(cells[clue.a as number], b.n);
    default: return holdsAt(clue, cell, b);
  }
}

/** True if `clue` holds for a complete placement. */
export const clueHolds = (clue: Clue, cells: readonly number[], b: Board): boolean => holdsAll(clue, cells, b);

/**
 * Every placement satisfying the rules and `clues`, up to `limit`. Backtracking over people,
 * most-constrained first; relational clues and the victim's room are checked as soon as the
 * people they mention are placed.
 */
export function solve(b: Board, clues: readonly Clue[], limit = 2): number[][] {
  const n = b.n;
  const candidates = range(n).map(p => {
    const own = clues.filter(c => c.p === p && UNARY.has(c.t));
    return range(n * n).filter(cell => !isBlocking(b.furniture[cell]) && own.every(c => holdsAt(c, cell, b)));
  });
  const global = clues.filter(c => !UNARY.has(c.t));
  const relational = global.filter(c => c.t === 'north' || c.t === 'west');
  const order = range(n).sort((x, y) => candidates[x].length - candidates[y].length);
  const cells = new Array<number>(n).fill(-1);
  const rowUsed = new Array<boolean>(n).fill(false), colUsed = new Array<boolean>(n).fill(false);
  const found: number[][] = [];

  const inVictimRoom = (): number => {
    const room = b.rooms[cells[b.victim]];
    return cells.filter(d => d >= 0 && b.rooms[d] === room).length;
  };
  const partialOk = (): boolean => {
    for (const c of relational) {
      if (cells[c.p] >= 0 && cells[c.a as number] >= 0 && !holdsAll(c, cells, b)) return false;
    }
    return cells[b.victim] < 0 || inVictimRoom() <= 2;
  };
  const finalOk = (): boolean => global.every(c => holdsAll(c, cells, b)) && inVictimRoom() === 2;

  const place = (i: number): void => {
    if (i === n) {
      if (finalOk()) found.push([...cells]);
      return;
    }
    const p = order[i];
    for (const cell of candidates[p]) {
      const r = rowOf(cell, n), c = colOf(cell, n);
      if (rowUsed[r] || colUsed[c]) continue;
      cells[p] = cell;
      rowUsed[r] = colUsed[c] = true;
      if (partialOk()) place(i + 1);
      cells[p] = -1;
      rowUsed[r] = colUsed[c] = false;
      if (found.length >= limit) return;
    }
  };
  place(0);
  return found;
}

const clueKey = (c: Clue): string => `${c.p}|${c.t}|${c.a ?? ''}`;

/** Every statement about `p` that is true in the solution and allowed at this level. */
function trueClues(w: World, p: number, weights: Weights): Clue[] {
  const out: Clue[] = [];
  const add = (t: ClueType, a?: number | Furniture): void => {
    const clue: Clue = a === undefined ? { p, t } : { p, t, a };
    if (weights[t] > 0 && holdsAll(clue, w.solution, w)) out.push(clue);
  };
  const cell = w.solution[p];
  w.roomIds.forEach((_, r) => { add('room', r); add('notRoom', r); });
  WALKABLE.forEach(f => add('on', f));
  FURNITURE.forEach(f => add('beside', f));
  add('bare'); add('edge'); add('inner');
  add('row', rowOf(cell, w.n)); add('col', colOf(cell, w.n));
  // «not alone» says nothing about the victim: the rules already put the killer beside them
  if (p !== w.victim) { add('alone'); add('company'); }
  for (let q = 0; q < w.n; q++) if (q !== p) { add('north', q); add('west', q); }
  return out;
}

/**
 * Deals a case. Each person starts with one random true statement; while a second placement
 * exists, a statement that rules it out is added. Then statements are dropped again, as long
 * as the case stays unique and everyone keeps at least one.
 */
export function generatePuzzle(difficulty: MurdokuDifficulty, seed: number): MurdokuPuzzle {
  const level = LEVELS[difficulty];
  const rng = seededRng(seed);
  for (let attempt = 0; attempt < 60; attempt++) {
    const w = buildWorld(level, rng);
    if (!w) continue;
    const pools = range(w.n).map(p => trueClues(w, p, level.weights));
    const perPerson = new Array<number>(w.n).fill(0);
    const weight = (c: Clue): number =>
      level.weights[c.t] / pools[c.p].filter(x => x.t === c.t).length / (1 + perPerson[c.p]);

    const clues: Clue[] = [];
    const taken = new Set<string>();
    const add = (c: Clue): void => { clues.push(c); taken.add(clueKey(c)); perPerson[c.p]++; };
    for (let p = 0; p < w.n; p++) {
      const c = weightedPick(pools[p], weight, rng);
      if (c) add(c);
    }

    let unique = false;
    for (let step = 0; step < 50; step++) {
      const found = solve(w, clues, 2);
      if (found.length === 1) { unique = true; break; }
      const other = found.find(s => s.some((cell, p) => cell !== w.solution[p]));
      if (!other) break;
      const ruling = pools.flat().filter(c => !taken.has(clueKey(c)) && !holdsAll(c, other, w));
      const c = weightedPick(ruling, weight, rng);
      if (!c) break;
      add(c);
    }
    if (!unique) continue;

    for (const c of shuffle([...clues], rng)) {
      if (rng() > level.prune) continue;
      if (clues.filter(x => x.p === c.p).length <= 1) continue;
      const without = clues.filter(x => x !== c);
      if (solve(w, without, 2).length === 1) clues.splice(clues.indexOf(c), 1);
    }
    return { ...w, difficulty, seed, clues };
  }
  throw new Error(`murdoku: no case for seed ${seed}`);
}

/** A fresh random seed for the next case. */
export const randomSeed = (rng: Rng = Math.random): number => 10000 + Math.floor(rng() * 90000);

/** People sharing a row or a column with someone else. */
export function conflictPeople(puzzle: Pick<MurdokuPuzzle, 'n'>, placement: Placement): Set<number> {
  const out = new Set<number>();
  placement.forEach((a, p) => {
    if (a === null) return;
    placement.forEach((b, q) => {
      if (q === p || b === null) return;
      if (rowOf(a, puzzle.n) === rowOf(b, puzzle.n) || colOf(a, puzzle.n) === colOf(b, puzzle.n)) out.add(p);
    });
  });
  return out;
}

export const isComplete = (placement: Placement): boolean => placement.every(c => c !== null);

/** True if everyone stands on their solution cell. The solution is unique, so this is the win. */
export const isSolved = (puzzle: Pick<MurdokuPuzzle, 'solution'>, placement: Placement): boolean =>
  placement.every((c, p) => c === puzzle.solution[p]);

/** Someone not yet on their solution cell, for a hint; null if everyone is. */
export function hintPerson(puzzle: Pick<MurdokuPuzzle, 'solution'>, placement: Placement, rng: Rng = Math.random): number | null {
  const wrong = puzzle.solution.map((_, p) => p).filter(p => placement[p] !== puzzle.solution[p]);
  return wrong.length ? pick(wrong, rng) : null;
}

/** «4:07». */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
