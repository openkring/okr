/**
 * Mühle (Nine Men's Morris) — pure, framework-agnostic rules engine.
 *
 * Board points are indexed 0..23:
 *
 *   0 ----------- 1 ----------- 2
 *   |             |             |
 *   |    3 ------ 4 ------ 5    |
 *   |    |        |        |    |
 *   |    |    6 - 7 - 8    |    |
 *   |    |    |       |    |    |
 *   9 -- 10 - 11      12 - 13 - 14
 *   |    |    |       |    |    |
 *   |    |   15 - 16 - 17  |    |
 *   |    |        |        |    |
 *   |   18 ----- 19 ----- 20    |
 *   |             |             |
 *  21 ---------- 22 ---------- 23
 *
 * All functions are pure: they never mutate the state passed in.
 */

export type Player = 'W' | 'B';
export type Cell = Player | null;
export type Phase = 'placing' | 'moving';

export interface MuehleState {
  /** 24 cells, see diagram above. */
  readonly board: readonly Cell[];
  /** Player to move. */
  readonly turn: Player;
  /** Stones still in hand (placing phase). */
  readonly inHand: Readonly<Record<Player, number>>;
  /** Plies played in the moving phase since the last removal (draw rule). */
  readonly pliesWithoutRemoval: number;
  /** Total plies played. */
  readonly ply: number;
  /** Set when the game is over. */
  readonly result: GameResult | null;
}

export type GameResult =
  | { kind: 'win'; winner: Player; reason: 'fewer-than-three' | 'no-moves' }
  | { kind: 'draw'; reason: 'no-removal-limit' };

/** A complete move. `from` is null while placing; `remove` is set when the move closes a mill. */
export interface MuehleMove {
  readonly from: number | null;
  readonly to: number;
  readonly remove: number | null;
}

export const POINTS = 24;
export const STONES_PER_PLAYER = 9;
/** Moving-phase plies without a removal before the game is declared a draw. */
export const DRAW_PLY_LIMIT = 100;

export const ADJACENT: readonly (readonly number[])[] = [
  [1, 9], [0, 2, 4], [1, 14],
  [4, 10], [1, 3, 5, 7], [4, 13],
  [7, 11], [4, 6, 8], [7, 12],
  [0, 10, 21], [3, 9, 11, 18], [6, 10, 15], [8, 13, 17], [5, 12, 14, 20], [2, 13, 23],
  [11, 16], [15, 17, 19], [12, 16],
  [10, 19], [16, 18, 20, 22], [13, 19],
  [9, 22], [19, 21, 23], [14, 22],
];

export const MILLS: readonly (readonly [number, number, number])[] = [
  // horizontal
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  // vertical
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
];

/** Mills each point belongs to (always exactly two). */
export const MILLS_BY_POINT: readonly (readonly (readonly [number, number, number])[])[] =
  Array.from({ length: POINTS }, (_, p) => MILLS.filter(m => m.includes(p)));

/** Grid coordinates (column, row) on a 7×7 grid, for rendering. */
export const COORDS: readonly (readonly [number, number])[] = [
  [0, 0], [3, 0], [6, 0],
  [1, 1], [3, 1], [5, 1],
  [2, 2], [3, 2], [4, 2],
  [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3],
  [2, 4], [3, 4], [4, 4],
  [1, 5], [3, 5], [5, 5],
  [0, 6], [3, 6], [6, 6],
];

export function opponent(p: Player): Player {
  return p === 'W' ? 'B' : 'W';
}

export function createGame(startingPlayer: Player = 'W'): MuehleState {
  return {
    board: Array<Cell>(POINTS).fill(null),
    turn: startingPlayer,
    inHand: { W: STONES_PER_PLAYER, B: STONES_PER_PLAYER },
    pliesWithoutRemoval: 0,
    ply: 0,
    result: null,
  };
}

export function stonesOnBoard(state: MuehleState, player: Player): number {
  let n = 0;
  for (const c of state.board) if (c === player) n++;
  return n;
}

/** Stones a player still controls: on the board plus in hand. */
export function stoneCount(state: MuehleState, player: Player): number {
  return stonesOnBoard(state, player) + state.inHand[player];
}

export function phaseOf(state: MuehleState, player: Player = state.turn): Phase {
  return state.inHand[player] > 0 ? 'placing' : 'moving';
}

/** True when the player may jump ("springen") to any empty point. */
export function canFly(state: MuehleState, player: Player = state.turn): boolean {
  return state.inHand[player] === 0 && stonesOnBoard(state, player) === 3;
}

/** True if `point` is part of a closed mill of `player` on `board`. */
export function isInMill(board: readonly Cell[], point: number, player: Player): boolean {
  return MILLS_BY_POINT[point].some(([a, b, c]) => board[a] === player && board[b] === player && board[c] === player);
}

/** Opponent stones that may be removed after `player` closes a mill. */
export function removableStones(board: readonly Cell[], player: Player): number[] {
  const opp = opponent(player);
  const all: number[] = [];
  const outsideMills: number[] = [];
  for (let p = 0; p < POINTS; p++) {
    if (board[p] !== opp) continue;
    all.push(p);
    if (!isInMill(board, p, opp)) outsideMills.push(p);
  }
  // Stones in a mill are protected unless every opponent stone is in a mill.
  return outsideMills.length > 0 ? outsideMills : all;
}

/** Target/source pairs without removal info. */
function stepMoves(state: MuehleState): { from: number | null; to: number }[] {
  const { board, turn } = state;
  const steps: { from: number | null; to: number }[] = [];
  if (phaseOf(state) === 'placing') {
    for (let p = 0; p < POINTS; p++) if (board[p] === null) steps.push({ from: null, to: p });
    return steps;
  }
  const flying = canFly(state);
  for (let from = 0; from < POINTS; from++) {
    if (board[from] !== turn) continue;
    const targets = flying ? board.keys() : ADJACENT[from].values();
    for (const to of targets) if (board[to] === null) steps.push({ from, to });
  }
  return steps;
}

/** All legal complete moves for the player to move. */
export function legalMoves(state: MuehleState): MuehleMove[] {
  if (state.result) return [];
  const moves: MuehleMove[] = [];
  for (const { from, to } of stepMoves(state)) {
    const board = state.board.slice();
    if (from !== null) board[from] = null;
    board[to] = state.turn;
    if (isInMill(board, to, state.turn)) {
      for (const remove of removableStones(board, state.turn)) moves.push({ from, to, remove });
    } else {
      moves.push({ from, to, remove: null });
    }
  }
  return moves;
}

/** True if placing/moving to `to` (from `from`) closes a mill — i.e. a removal must follow. */
export function closesMill(state: MuehleState, from: number | null, to: number): boolean {
  const board = state.board.slice();
  if (from !== null) board[from] = null;
  board[to] = state.turn;
  return isInMill(board, to, state.turn);
}

export function isLegal(state: MuehleState, move: MuehleMove): boolean {
  return legalMoves(state).some(m => m.from === move.from && m.to === move.to && m.remove === move.remove);
}

/** Applies a move without validating it. Use `play` for untrusted input. */
export function applyMove(state: MuehleState, move: MuehleMove): MuehleState {
  const board = state.board.slice();
  const mover = state.turn;
  const inHand = { ...state.inHand };
  const wasMovingPhase = phaseOf(state, mover) === 'moving';

  if (move.from === null) inHand[mover]--;
  else board[move.from] = null;
  board[move.to] = mover;
  if (move.remove !== null) board[move.remove] = null;

  const next: MuehleState = {
    board,
    turn: opponent(mover),
    inHand,
    ply: state.ply + 1,
    pliesWithoutRemoval: move.remove !== null ? 0 : wasMovingPhase ? state.pliesWithoutRemoval + 1 : 0,
    result: null,
  };
  return { ...next, result: evaluateResult(next) };
}

/** Validates and applies a move; throws on illegal input. */
export function play(state: MuehleState, move: MuehleMove): MuehleState {
  if (state.result) throw new Error('Game is already over');
  if (!isLegal(state, move)) throw new Error(`Illegal move ${JSON.stringify(move)}`);
  return applyMove(state, move);
}

function evaluateResult(state: MuehleState): GameResult | null {
  const toMove = state.turn;
  const last = opponent(toMove);
  if (stoneCount(state, toMove) < 3) return { kind: 'win', winner: last, reason: 'fewer-than-three' };
  if (stepMoves(state).length === 0) return { kind: 'win', winner: last, reason: 'no-moves' };
  if (state.pliesWithoutRemoval >= DRAW_PLY_LIMIT) return { kind: 'draw', reason: 'no-removal-limit' };
  return null;
}
