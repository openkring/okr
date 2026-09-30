/** Side to move / piece colour. */
export type Color = 'w' | 'b';

/** Piece kind, lower case as in FEN. */
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/** A piece as its FEN letter: upper case = white, lower case = black. */
export type Piece = 'P' | 'N' | 'B' | 'R' | 'Q' | 'K' | 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

/**
 * Board index in FEN reading order: 0 = a8, 7 = h8, 56 = a1, 63 = h1. Only the helpers in this
 * file know that layout; everything else goes through them.
 */
export type Square = number;

export interface Castling { K: boolean; Q: boolean; k: boolean; q: boolean }

export interface Position {
  readonly board: readonly (Piece | null)[];
  readonly turn: Color;
  readonly castling: Readonly<Castling>;
  /** The square a pawn skipped with a double step on the previous move, else null. */
  readonly ep: Square | null;
  /** Half-moves since the last capture or pawn move (50-move rule). */
  readonly halfmove: number;
  readonly fullmove: number;
}

export type MoveKind = 'normal' | 'double' | 'ep' | 'castle';

export interface Move {
  readonly from: Square;
  readonly to: Square;
  readonly piece: Piece;
  readonly captured: Piece | null;
  readonly promotion: PieceType | null;
  readonly kind: MoveKind;
}

export type ResultKind =
  | 'checkmate' | 'stalemate' | 'repetition' | 'fifty-move' | 'insufficient'
  | 'timeout' | 'resign' | 'agreement';

export interface GameResult {
  readonly kind: ResultKind;
  /** null is a draw. */
  readonly winner: Color | null;
  /** The side that resigned or ran out of time. */
  readonly by?: Color;
}

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Material in centipawns; the king is priceless and counts 0. */
export const PIECE_VALUE: Readonly<Record<PieceType, number>> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

export const colorOf = (p: Piece): Color => (p === p.toUpperCase() ? 'w' : 'b');
export const typeOf = (p: Piece): PieceType => p.toLowerCase() as PieceType;
export const makePiece = (c: Color, t: PieceType): Piece => (c === 'w' ? t.toUpperCase() : t) as Piece;
export const opponent = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** 0 = a-file … 7 = h-file. */
export const fileOf = (sq: Square): number => sq & 7;
/** 0 = first rank … 7 = eighth rank. */
export const rankOf = (sq: Square): number => 7 - (sq >> 3);
export const squareAt = (file: number, rank: number): Square => (7 - rank) * 8 + file;

export function squareName(sq: Square): string {
  return 'abcdefgh'[fileOf(sq)] + (rankOf(sq) + 1);
}

export function parseSquare(name: string): Square | null {
  if (!/^[a-h][1-8]$/.test(name)) return null;
  return squareAt(name.charCodeAt(0) - 97, Number(name[1]) - 1);
}
