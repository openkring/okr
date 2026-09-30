import {
  Color, Move, MoveKind, Piece, PieceType, Position, Square,
  colorOf, fileOf, makePiece, opponent, rankOf, squareAt, typeOf,
} from './chess.types';

type Board = Position['board'];
type Delta = readonly [number, number];

const KNIGHT_DELTAS: Delta[] = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_DELTAS: Delta[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_DIRS: Delta[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_DIRS: Delta[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const PROMOTIONS: PieceType[] = ['q', 'r', 'b', 'n'];

/** The square `(df, dr)` away from `sq`, or -1 when that leaves the board. */
function offset(sq: Square, df: number, dr: number): Square {
  const f = fileOf(sq) + df;
  const r = rankOf(sq) + dr;
  return f < 0 || f > 7 || r < 0 || r > 7 ? -1 : squareAt(f, r);
}

const SQUARES = Array.from({ length: 64 }, (_, sq) => sq);
const jumps = (deltas: Delta[]): Square[][] =>
  SQUARES.map(sq => deltas.map(([df, dr]) => offset(sq, df, dr)).filter(t => t >= 0));
const rays = (dirs: Delta[]): Square[][][] =>
  SQUARES.map(sq => dirs.map(([df, dr]) => {
    const ray: Square[] = [];
    for (let t = offset(sq, df, dr); t >= 0; t = offset(t, df, dr)) ray.push(t);
    return ray;
  }));

const KNIGHT_TARGETS = jumps(KNIGHT_DELTAS);
const KING_TARGETS = jumps(KING_DELTAS);
const ROOK_RAYS = rays(ROOK_DIRS);
const BISHOP_RAYS = rays(BISHOP_DIRS);

/** Where the rook goes when the king castles to `to` (king target → [rook from, rook to]). */
const ROOK_CASTLE: Readonly<Record<number, readonly [Square, Square]>> = {
  62: [63, 61], 58: [56, 59], 6: [7, 5], 2: [0, 3],
};

export function kingSquare(board: Board, color: Color): Square {
  return board.indexOf(color === 'w' ? 'K' : 'k');
}

export function isAttacked(board: Board, sq: Square, by: Color): boolean {
  const white = by === 'w';
  // a pawn attacks diagonally forward, so look diagonally backward from the target
  const pawn = white ? 'P' : 'p';
  for (const df of [-1, 1]) {
    const from = offset(sq, df, white ? -1 : 1);
    if (from >= 0 && board[from] === pawn) return true;
  }
  const knight = white ? 'N' : 'n';
  for (const t of KNIGHT_TARGETS[sq]) if (board[t] === knight) return true;
  const king = white ? 'K' : 'k';
  for (const t of KING_TARGETS[sq]) if (board[t] === king) return true;

  const [rook, bishop, queen] = white ? ['R', 'B', 'Q'] : ['r', 'b', 'q'];
  for (const ray of ROOK_RAYS[sq]) {
    for (const t of ray) {
      const p = board[t];
      if (p) {
        if (p === rook || p === queen) return true;
        break;
      }
    }
  }
  for (const ray of BISHOP_RAYS[sq]) {
    for (const t of ray) {
      const p = board[t];
      if (p) {
        if (p === bishop || p === queen) return true;
        break;
      }
    }
  }
  return false;
}

export function inCheck(pos: Position, color: Color = pos.turn): boolean {
  return isAttacked(pos.board, kingSquare(pos.board, color), opponent(color));
}

const move = (from: Square, to: Square, piece: Piece, captured: Piece | null, kind: MoveKind = 'normal'): Move =>
  ({ from, to, piece, captured, promotion: null, kind });

function pushPawn(moves: Move[], from: Square, to: Square, piece: Piece, captured: Piece | null, promoting: boolean): void {
  if (promoting) {
    for (const promotion of PROMOTIONS) moves.push({ from, to, piece, captured, promotion, kind: 'normal' });
  } else {
    moves.push(move(from, to, piece, captured));
  }
}

/** Moves that follow the piece rules but may leave the own king in check. */
function pseudoMoves(pos: Position): Move[] {
  const { board, turn } = pos;
  const moves: Move[] = [];
  const forward = turn === 'w' ? 1 : -1;
  const startRank = turn === 'w' ? 1 : 6;
  const lastRank = turn === 'w' ? 7 : 0;
  const own = (p: Piece | null) => p !== null && colorOf(p) === turn;

  for (let from = 0; from < 64; from++) {
    const piece = board[from];
    if (!piece || colorOf(piece) !== turn) continue;
    const type = typeOf(piece);

    if (type === 'p') {
      const one = offset(from, 0, forward);
      if (one >= 0 && board[one] === null) {
        pushPawn(moves, from, one, piece, null, rankOf(one) === lastRank);
        const two = offset(from, 0, 2 * forward);
        if (rankOf(from) === startRank && board[two] === null) moves.push(move(from, two, piece, null, 'double'));
      }
      for (const df of [-1, 1]) {
        const to = offset(from, df, forward);
        if (to < 0) continue;
        const target = board[to];
        if (target && colorOf(target) !== turn) {
          pushPawn(moves, from, to, piece, target, rankOf(to) === lastRank);
        } else if (to === pos.ep) {
          moves.push(move(from, to, piece, makePiece(opponent(turn), 'p'), 'ep'));
        }
      }
    } else if (type === 'n' || type === 'k') {
      for (const to of (type === 'n' ? KNIGHT_TARGETS : KING_TARGETS)[from]) {
        if (!own(board[to])) moves.push(move(from, to, piece, board[to]));
      }
    } else {
      const sets = type === 'r' ? [ROOK_RAYS] : type === 'b' ? [BISHOP_RAYS] : [ROOK_RAYS, BISHOP_RAYS];
      for (const set of sets) {
        for (const ray of set[from]) {
          for (const to of ray) {
            const target = board[to];
            if (own(target)) break;
            moves.push(move(from, to, piece, target));
            if (target) break;
          }
        }
      }
    }
  }

  // Castling: right, empty squares between, rook at home. Check and the transit square are
  // tested in legalMoves.
  const c = pos.castling;
  if (turn === 'w' && board[60] === 'K') {
    if (c.K && board[61] === null && board[62] === null && board[63] === 'R') moves.push(move(60, 62, 'K', null, 'castle'));
    if (c.Q && board[59] === null && board[58] === null && board[57] === null && board[56] === 'R') moves.push(move(60, 58, 'K', null, 'castle'));
  }
  if (turn === 'b' && board[4] === 'k') {
    if (c.k && board[5] === null && board[6] === null && board[7] === 'r') moves.push(move(4, 6, 'k', null, 'castle'));
    if (c.q && board[3] === null && board[2] === null && board[1] === null && board[0] === 'r') moves.push(move(4, 2, 'k', null, 'castle'));
  }
  return moves;
}

export function legalMoves(pos: Position): Move[] {
  const enemy = opponent(pos.turn);
  return pseudoMoves(pos).filter(m => {
    if (m.kind === 'castle') {
      if (inCheck(pos)) return false;
      if (isAttacked(pos.board, (m.from + m.to) / 2, enemy)) return false;
    }
    const next = applyMove(pos, m);
    return !isAttacked(next.board, kingSquare(next.board, pos.turn), enemy);
  });
}

/** Pure: returns the position after `m`. `m` must come from `legalMoves(pos)`. */
export function applyMove(pos: Position, m: Move): Position {
  const board = pos.board.slice();
  board[m.from] = null;
  board[m.to] = m.promotion ? makePiece(pos.turn, m.promotion) : m.piece;
  if (m.kind === 'ep') board[m.to + (pos.turn === 'w' ? 8 : -8)] = null;
  if (m.kind === 'castle') {
    const [rookFrom, rookTo] = ROOK_CASTLE[m.to];
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }

  const castling = { ...pos.castling };
  if (m.piece === 'K') { castling.K = false; castling.Q = false; }
  if (m.piece === 'k') { castling.k = false; castling.q = false; }
  // a rook leaving its corner, or anything landing on it, ends that right
  for (const sq of [m.from, m.to]) {
    if (sq === 63) castling.K = false;
    if (sq === 56) castling.Q = false;
    if (sq === 7) castling.k = false;
    if (sq === 0) castling.q = false;
  }

  const resetsClock = typeOf(m.piece) === 'p' || m.captured !== null;
  return {
    board,
    turn: opponent(pos.turn),
    castling,
    ep: m.kind === 'double' ? (m.from + m.to) / 2 : null,
    halfmove: resetsClock ? 0 : pos.halfmove + 1,
    fullmove: pos.turn === 'b' ? pos.fullmove + 1 : pos.fullmove,
  };
}

/** Number of leaf positions `depth` plies deep — the standard move-generator correctness test. */
export function perft(pos: Position, depth: number): number {
  if (depth === 0) return 1;
  const moves = legalMoves(pos);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const m of moves) nodes += perft(applyMove(pos, m), depth - 1);
  return nodes;
}
