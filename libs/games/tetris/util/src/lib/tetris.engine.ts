/**
 * Falling-block game rules — pure functions over an immutable `TetrisState`.
 *
 * Follows the modern guideline where it matters for feel: 7-bag randomizer, SRS rotation with
 * wall kicks, a 500 ms lock delay with at most 15 move resets, hold once per piece, and
 * level-based gravity. Deliberately left out: T-spin detection and perfect-clear bonuses.
 *
 * Coordinates: x grows to the right, y grows DOWN. The board has `HIDDEN_ROWS` rows above the
 * visible field where pieces spawn; only rows `HIDDEN_ROWS..ROWS-1` are drawn.
 *
 * Every function returns the SAME object when nothing changed (a blocked move, a used hold), so
 * a caller can compare references to skip work.
 */

export const COLS = 10;
export const VISIBLE_ROWS = 20;
export const HIDDEN_ROWS = 2;
export const ROWS = VISIBLE_ROWS + HIDDEN_ROWS;

export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const LINES_PER_LEVEL = 10;
export const MAX_LEVEL = 20;
/** Pieces kept in the queue; the page shows the first few as preview. */
export const QUEUE_LENGTH = 5;

export type PieceType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';
export const PIECE_TYPES: readonly PieceType[] = ['I', 'J', 'L', 'O', 'S', 'T', 'Z'];

export type Rotation = 0 | 1 | 2 | 3;
export type Cell = PieceType | null;
export type Point = readonly [number, number];

export interface Piece {
  type: PieceType;
  rot: Rotation;
  /** Top-left corner of the piece's bounding box on the board. */
  x: number;
  y: number;
}

/** What the last line clear earned — for the score pop-up. `id` changes with every clear. */
export interface ClearEvent {
  id: number;
  lines: number;
  points: number;
  /** Consecutive clearing pieces minus one; 0 for the first clear of a chain. */
  combo: number;
  backToBack: boolean;
}

export interface TetrisState {
  /** Row-major, `ROWS * COLS` cells. */
  board: readonly Cell[];
  active: Piece | null;
  queue: readonly PieceType[];
  /** What is left of the current 7-bag. */
  bag: readonly PieceType[];
  /** Random generator state, so a game is reproducible and serialisable. */
  seed: number;
  hold: PieceType | null;
  /** True once the current piece came from (or went into) hold. */
  holdUsed: boolean;
  score: number;
  lines: number;
  level: number;
  startLevel: number;
  /** -1 while no combo runs. */
  combo: number;
  /** The previous clear was a four-line clear. */
  backToBack: boolean;
  /** Time collected towards the next gravity step. */
  fallMs: number;
  /** Time the active piece has rested on the stack. */
  lockMs: number;
  lockResets: number;
  /** Lowest row the active piece has reached; a new low restores the lock resets. */
  lowestY: number;
  pieces: number;
  lastClear: ClearEvent | null;
  over: boolean;
}

// ---------------------------------------------------------------------------------------------
// shapes

const SPAWN: Record<PieceType, readonly Point[]> = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
  O: [[1, 0], [2, 0], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
};

/** Bounding-box size per piece: SRS rotates I (and O) in a 4×4 box, all others in 3×3. */
const BOX: Record<PieceType, number> = { I: 4, O: 4, J: 3, L: 3, S: 3, T: 3, Z: 3 };

const rotateCw = (cells: readonly Point[], n: number): Point[] => cells.map(([x, y]) => [n - 1 - y, x] as const);

function rotationStates(type: PieceType): readonly (readonly Point[])[] {
  const states: Point[][] = [SPAWN[type].slice()];
  for (let r = 1; r < 4; r++) {
    states.push(type === 'O' ? states[0] : rotateCw(states[r - 1], BOX[type]));
  }
  return states;
}

/** `SHAPES[type][rot]` — the four cells of a piece in its bounding box. O never changes. */
export const SHAPES: Record<PieceType, readonly (readonly Point[])[]> = {
  I: rotationStates('I'), J: rotationStates('J'), L: rotationStates('L'), O: rotationStates('O'),
  S: rotationStates('S'), T: rotationStates('T'), Z: rotationStates('Z'),
};

// SRS kick tests, written as in the guideline tables with y pointing UP; `rotate` flips y.
type KickTable = Record<string, readonly Point[]>;
const JLSTZ_KICKS: KickTable = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
};
const I_KICKS: KickTable = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
};

/** Board cells covered by a piece. */
export function cellsOf(piece: Piece): Point[] {
  return SHAPES[piece.type][piece.rot].map(([cx, cy]) => [piece.x + cx, piece.y + cy] as const);
}

export function collides(board: readonly Cell[], piece: Piece): boolean {
  return cellsOf(piece).some(([x, y]) =>
    x < 0 || x >= COLS || y < 0 || y >= ROWS || board[y * COLS + x] !== null,
  );
}

const isGrounded = (board: readonly Cell[], piece: Piece) => collides(board, { ...piece, y: piece.y + 1 });

/** Row the active piece would land on — where the ghost is drawn. */
export function dropY(board: readonly Cell[], piece: Piece): number {
  let y = piece.y;
  while (!collides(board, { ...piece, y: y + 1 })) y++;
  return y;
}

// ---------------------------------------------------------------------------------------------
// randomness

/** mulberry32 — returns a float in [0, 1) and the next seed. */
export function nextRandom(seed: number): [number, number] {
  const next = (seed + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** A shuffled bag holding each of the seven pieces exactly once. */
export function shuffledBag(seed: number): { bag: PieceType[]; seed: number } {
  const bag = PIECE_TYPES.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const [r, s] = nextRandom(seed);
    seed = s;
    const j = Math.floor(r * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return { bag, seed };
}

function refill(queue: readonly PieceType[], bag: readonly PieceType[], seed: number) {
  const q = queue.slice();
  let b = bag.slice();
  while (q.length < QUEUE_LENGTH) {
    if (b.length === 0) ({ bag: b, seed } = shuffledBag(seed));
    q.push(b.shift() as PieceType);
  }
  return { queue: q, bag: b, seed };
}

// ---------------------------------------------------------------------------------------------
// game flow

/** Seconds per row from the guideline formula, in milliseconds. Level 1 = 1 s. */
export function gravityMs(level: number): number {
  const l = Math.min(Math.max(level, 1), MAX_LEVEL);
  return Math.pow(0.8 - (l - 1) * 0.007, l - 1) * 1000;
}

export function levelFor(startLevel: number, lines: number): number {
  return Math.min(MAX_LEVEL, startLevel + Math.floor(lines / LINES_PER_LEVEL));
}

/** Puts `type` at the top. Blocked spawn position = game over (block out). */
function spawn(state: TetrisState, type: PieceType): TetrisState {
  let piece: Piece = { type, rot: 0, x: 3, y: 0 };
  if (collides(state.board, piece)) return { ...state, active: null, over: true };
  // Like the guideline, drop one row straight away if there is room, so the piece shows at once.
  if (!collides(state.board, { ...piece, y: 1 })) piece = { ...piece, y: 1 };
  return { ...state, active: piece, fallMs: 0, lockMs: 0, lockResets: 0, lowestY: piece.y };
}

function spawnNext(state: TetrisState): TetrisState {
  const [type, ...rest] = state.queue;
  const { queue, bag, seed } = refill(rest, state.bag, state.seed);
  return spawn({ ...state, queue, bag, seed }, type);
}

export function createGame(seed: number, startLevel = 1): TetrisState {
  const level = Math.min(Math.max(Math.floor(startLevel), 1), MAX_LEVEL);
  const { queue, bag, seed: next } = refill([], [], seed >>> 0);
  return spawnNext({
    board: Array<Cell>(ROWS * COLS).fill(null),
    active: null,
    queue, bag, seed: next,
    hold: null, holdUsed: false,
    score: 0, lines: 0, level, startLevel: level,
    combo: -1, backToBack: false,
    fallMs: 0, lockMs: 0, lockResets: 0, lowestY: 0,
    pieces: 0,
    lastClear: null,
    over: false,
  });
}

const BASE_POINTS = [0, 100, 300, 500, 800];

/** Writes the active piece into the board, clears full rows, scores, and spawns the next piece. */
function lock(state: TetrisState): TetrisState {
  const piece = state.active;
  if (!piece) return state;
  const cells = cellsOf(piece);
  const placed = state.board.slice();
  for (const [x, y] of cells) placed[y * COLS + x] = piece.type;

  const kept: Cell[][] = [];
  for (let y = 0; y < ROWS; y++) {
    const row = placed.slice(y * COLS, (y + 1) * COLS);
    if (row.some(c => c === null)) kept.push(row);
  }
  const cleared = ROWS - kept.length;
  const empty = Array.from({ length: cleared }, () => Array<Cell>(COLS).fill(null));
  const board = [...empty, ...kept].flat();

  const pieces = state.pieces + 1;
  let { score, combo, backToBack, lastClear } = state;
  if (cleared > 0) {
    const b2b = cleared === 4 && state.backToBack;
    combo = state.combo + 1;
    const points = Math.floor(BASE_POINTS[cleared] * state.level * (b2b ? 1.5 : 1)) + 50 * combo * state.level;
    score += points;
    backToBack = cleared === 4;
    lastClear = { id: pieces, lines: cleared, points, combo, backToBack: b2b };
  } else {
    combo = -1;
  }
  const lines = state.lines + cleared;

  const next: TetrisState = {
    ...state,
    board, active: null, holdUsed: false,
    score, lines, level: levelFor(state.startLevel, lines),
    combo, backToBack, pieces, lastClear,
  };
  // Lock out: the piece came to rest entirely above the visible field.
  if (cells.every(([, y]) => y < HIDDEN_ROWS)) return { ...next, over: true };
  return spawnNext(next);
}

/** Bookkeeping after the active piece moved or rotated successfully (move-reset lock delay). */
function moved(state: TetrisState, piece: Piece): TetrisState {
  let { lockMs, lockResets, lowestY } = state;
  if (piece.y > lowestY) {
    lowestY = piece.y;
    lockResets = 0;
    lockMs = 0;
  } else if (state.active && isGrounded(state.board, state.active) && lockResets < MAX_LOCK_RESETS) {
    lockResets++;
    lockMs = 0;
  }
  return { ...state, active: piece, lockMs, lockResets, lowestY };
}

const playable = (state: TetrisState): state is TetrisState & { active: Piece } => !state.over && state.active !== null;

export function move(state: TetrisState, dx: -1 | 1): TetrisState {
  if (!playable(state)) return state;
  const piece = { ...state.active, x: state.active.x + dx };
  return collides(state.board, piece) ? state : moved(state, piece);
}

/** `dir` 1 = clockwise, -1 = counter-clockwise. Tries the SRS kicks in order. */
export function rotate(state: TetrisState, dir: 1 | -1): TetrisState {
  if (!playable(state) || state.active.type === 'O') return state;
  const from = state.active.rot;
  const to = ((from + dir + 4) % 4) as Rotation;
  const kicks = (state.active.type === 'I' ? I_KICKS : JLSTZ_KICKS)[`${from}>${to}`];
  for (const [kx, ky] of kicks) {
    const piece: Piece = { ...state.active, rot: to, x: state.active.x + kx, y: state.active.y - ky };
    if (!collides(state.board, piece)) return moved(state, piece);
  }
  return state;
}

/** One row down on demand, 1 point. Does nothing on the stack — the lock delay decides. */
export function softDrop(state: TetrisState): TetrisState {
  if (!playable(state)) return state;
  const piece = { ...state.active, y: state.active.y + 1 };
  if (collides(state.board, piece)) return state;
  return { ...moved(state, piece), score: state.score + 1, fallMs: 0 };
}

/** Straight down and locked at once, 2 points per row. */
export function hardDrop(state: TetrisState): TetrisState {
  if (!playable(state)) return state;
  const y = dropY(state.board, state.active);
  const distance = y - state.active.y;
  return lock({ ...state, active: { ...state.active, y }, score: state.score + 2 * distance });
}

/** Swaps the active piece with the held one (or parks it and takes the next). Once per piece. */
export function holdPiece(state: TetrisState): TetrisState {
  if (!playable(state) || state.holdUsed) return state;
  const current = state.active.type;
  const next = state.hold === null
    ? spawnNext({ ...state, hold: current })
    : spawn({ ...state, hold: current }, state.hold);
  return { ...next, holdUsed: true };
}

/** Advances time: gravity while falling, the lock delay while resting on the stack. */
export function tick(state: TetrisState, dtMs: number): TetrisState {
  if (!playable(state) || dtMs <= 0) return state;

  if (isGrounded(state.board, state.active)) {
    const lockMs = state.lockMs + dtMs;
    // Out of move resets: the piece locks the moment it touches down again.
    return lockMs >= LOCK_DELAY_MS || state.lockResets >= MAX_LOCK_RESETS ? lock(state) : { ...state, lockMs };
  }

  const interval = gravityMs(state.level);
  let fallMs = state.fallMs + dtMs;
  let piece = state.active;
  while (fallMs >= interval) {
    const down = { ...piece, y: piece.y + 1 };
    if (collides(state.board, down)) {
      fallMs = 0;
      break;
    }
    piece = down;
    fallMs -= interval;
  }
  if (piece === state.active) return { ...state, fallMs };
  return { ...moved(state, piece), fallMs };
}

// ---------------------------------------------------------------------------------------------
// persistence

/** A saved game read back from storage, or null if it does not look like one. */
export function parseSavedGame(json: string | null): TetrisState | null {
  if (!json) return null;
  try {
    const s = JSON.parse(json) as Partial<TetrisState>;
    const isType = (t: unknown): t is PieceType => PIECE_TYPES.includes(t as PieceType);
    const ok =
      Array.isArray(s.board) && s.board.length === ROWS * COLS &&
      s.board.every(c => c === null || isType(c)) &&
      Array.isArray(s.queue) && s.queue.length === QUEUE_LENGTH && s.queue.every(isType) &&
      Array.isArray(s.bag) && s.bag.every(isType) &&
      (s.hold === null || isType(s.hold)) &&
      !!s.active && isType(s.active.type) && [0, 1, 2, 3].includes(s.active.rot) &&
      [s.seed, s.score, s.lines, s.level, s.startLevel, s.combo, s.fallMs, s.lockMs, s.lockResets, s.lowestY, s.pieces, s.active.x, s.active.y]
        .every(n => typeof n === 'number' && Number.isFinite(n)) &&
      s.over === false;
    if (!ok) return null;
    const state = s as TetrisState;
    return collides(state.board, state.active as Piece) ? null : state;
  } catch {
    return null;
  }
}
