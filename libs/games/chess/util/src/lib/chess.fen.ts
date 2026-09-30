import { Castling, Color, Piece, Position, fileOf, parseSquare, squareName } from './chess.types';

export class FenError extends Error {
  public constructor(fen: string, reason: string) {
    super(`Invalid FEN (${reason}): ${fen}`);
    this.name = 'FenError';
  }
}

const PIECE_RE = /^[pnbrqkPNBRQK]$/;

export function parseFen(fen: string): Position {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4 || parts.length > 6) throw new FenError(fen, 'field count');
  const [placement, turn, castlingField, epField, half = '0', full = '1'] = parts;

  const rows = placement.split('/');
  if (rows.length !== 8) throw new FenError(fen, 'rank count');
  const board: (Piece | null)[] = [];
  for (const row of rows) {
    let width = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < Number(ch); i++) board.push(null);
        width += Number(ch);
      } else if (PIECE_RE.test(ch)) {
        board.push(ch as Piece);
        width += 1;
      } else {
        throw new FenError(fen, `unexpected '${ch}'`);
      }
    }
    if (width !== 8) throw new FenError(fen, 'rank width');
  }
  if (board.filter(p => p === 'K').length !== 1 || board.filter(p => p === 'k').length !== 1) {
    throw new FenError(fen, 'kings');
  }

  if (turn !== 'w' && turn !== 'b') throw new FenError(fen, 'side to move');
  if (!/^(-|K?Q?k?q?)$/.test(castlingField)) throw new FenError(fen, 'castling');
  const castling: Castling = {
    K: castlingField.includes('K'),
    Q: castlingField.includes('Q'),
    k: castlingField.includes('k'),
    q: castlingField.includes('q'),
  };
  const ep = epField === '-' ? null : parseSquare(epField);
  if (epField !== '-' && ep === null) throw new FenError(fen, 'en passant');
  const halfmove = Number(half);
  const fullmove = Number(full);
  if (!Number.isInteger(halfmove) || halfmove < 0 || !Number.isInteger(fullmove) || fullmove < 1) {
    throw new FenError(fen, 'move counters');
  }
  return { board, turn: turn as Color, castling, ep, halfmove, fullmove };
}

function placementOf(board: Position['board']): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board[r * 8 + f];
      if (p) {
        if (empty) row += empty;
        empty = 0;
        row += p;
      } else {
        empty++;
      }
    }
    rows.push(empty ? row + empty : row);
  }
  return rows.join('/');
}

function castlingOf(c: Position['castling']): string {
  return (c.K ? 'K' : '') + (c.Q ? 'Q' : '') + (c.k ? 'k' : '') + (c.q ? 'q' : '') || '-';
}

export function toFen(pos: Position): string {
  const ep = pos.ep === null ? '-' : squareName(pos.ep);
  return `${placementOf(pos.board)} ${pos.turn} ${castlingOf(pos.castling)} ${ep} ${pos.halfmove} ${pos.fullmove}`;
}

/** A pawn of the side to move stands beside the pawn that just double-stepped. */
function epRelevant(pos: Position): boolean {
  if (pos.ep === null) return false;
  const pawn = pos.turn === 'w' ? 'P' : 'p';
  const beside = pos.turn === 'w' ? pos.ep + 8 : pos.ep - 8; // the double-stepped pawn's square
  const f = fileOf(pos.ep);
  return (f > 0 && pos.board[beside - 1] === pawn) || (f < 7 && pos.board[beside + 1] === pawn);
}

/**
 * Identity of a position for the repetition rule: placement, side to move, castling rights, and
 * the en-passant square only when that capture is actually possible (FIDE compares the moves
 * available, not the FEN field).
 */
export function positionKey(pos: Position): string {
  const ep = epRelevant(pos) ? squareName(pos.ep as number) : '-';
  return `${placementOf(pos.board)} ${pos.turn} ${castlingOf(pos.castling)} ${ep}`;
}
