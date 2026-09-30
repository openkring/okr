import { applyMove, inCheck, legalMoves } from './chess.engine';
import { parseFen, positionKey } from './chess.fen';
import { fromUci } from './chess.notation';
import {
  Color, GameResult, Move, PIECE_VALUE, PieceType, Position, colorOf, fileOf, opponent, rankOf, typeOf,
} from './chess.types';

type Board = Position['board'];

export interface Replay {
  readonly positions: Position[];
  readonly moves: Move[];
}

/** Replays UCI moves from a FEN. Null when the FEN or any move is invalid. */
export function replay(initialFen: string, uci: readonly string[]): Replay | null {
  let pos: Position;
  try {
    pos = parseFen(initialFen);
  } catch {
    return null;
  }
  const positions = [pos];
  const moves: Move[] = [];
  for (const u of uci) {
    const m = fromUci(pos, u);
    if (!m) return null;
    pos = applyMove(pos, m);
    positions.push(pos);
    moves.push(m);
  }
  return { positions, moves };
}

const isMinor = (t: PieceType) => t === 'n' || t === 'b';
const shade = (sq: number) => (fileOf(sq) + rankOf(sq)) % 2;

/** Neither side can mate: bare kings, one minor piece, or only bishops all on one colour. */
export function insufficientMaterial(board: Board): boolean {
  const minors: { type: PieceType; sq: number }[] = [];
  for (let sq = 0; sq < 64; sq++) {
    const p = board[sq];
    if (!p || typeOf(p) === 'k') continue;
    if (!isMinor(typeOf(p))) return false;
    minors.push({ type: typeOf(p), sq });
  }
  if (minors.length <= 1) return true;
  return minors.every(m => m.type === 'b') && minors.every(m => shade(m.sq) === shade(minors[0].sq));
}

/**
 * Whether `color` could still mate by some legal sequence — decides flag fall: out of time
 * against a side that cannot mate is a draw.
 */
export function hasMatingMaterial(board: Board, color: Color): boolean {
  let minors = 0;
  let opponentHasMore = false;
  for (const p of board) {
    if (!p || typeOf(p) === 'k') continue;
    if (colorOf(p) !== color) {
      opponentHasMore = true;
    } else if (!isMinor(typeOf(p))) {
      return true;
    } else {
      minors++;
    }
  }
  return minors >= 2 || (minors === 1 && opponentHasMore);
}

/**
 * The result the position itself decides, or null while the game runs. Resignation, agreement
 * and flag fall are the caller's. `positions` is the game so far, the current position last.
 */
export function gameResult(positions: readonly Position[]): GameResult | null {
  const pos = positions[positions.length - 1];
  if (legalMoves(pos).length === 0) {
    return inCheck(pos) ? { kind: 'checkmate', winner: opponent(pos.turn) } : { kind: 'stalemate', winner: null };
  }
  if (insufficientMaterial(pos.board)) return { kind: 'insufficient', winner: null };
  if (pos.halfmove >= 100) return { kind: 'fifty-move', winner: null };
  const key = positionKey(pos);
  // only positions since the last capture or pawn move can repeat
  const window = positions.slice(-(pos.halfmove + 1));
  if (window.filter(p => positionKey(p) === key).length >= 3) return { kind: 'repetition', winner: null };
  return null;
}

/** Pieces each side has taken: `w` = black pieces captured by white. Most valuable first. */
export interface Captures {
  readonly w: PieceType[];
  readonly b: PieceType[];
}

export function capturedPieces(moves: readonly Move[]): Captures {
  const out: Captures = { w: [], b: [] };
  for (const m of moves) if (m.captured) out[colorOf(m.piece)].push(typeOf(m.captured));
  const byValue = (a: PieceType, b: PieceType) => PIECE_VALUE[b] - PIECE_VALUE[a];
  out.w.sort(byValue);
  out.b.sort(byValue);
  return out;
}

const PAWN_UNITS: Readonly<Record<PieceType, number>> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Material balance in pawn units (1/3/3/5/9); positive when white is ahead. */
export function materialBalance(board: Board): number {
  let sum = 0;
  for (const p of board) if (p) sum += (colorOf(p) === 'w' ? 1 : -1) * PAWN_UNITS[typeOf(p)];
  return sum;
}

/**
 * How many moves remain after "undo": one half-move back between two people (`human` null);
 * against the computer, back to the person's own previous turn. Null when there is nothing of
 * the person's to take back.
 */
export function undoLength(moveCount: number, initialTurn: Color, human: Color | null): number | null {
  if (moveCount === 0) return null;
  if (human === null) return moveCount - 1;
  const turnAfter = (n: number): Color => (n % 2 === 0 ? initialTurn : opponent(initialTurn));
  let n = moveCount - 1;
  while (n > 0 && turnAfter(n) !== human) n--;
  // the person has made no move yet if we would land before their first turn
  return turnAfter(n) === human ? n : null;
}
