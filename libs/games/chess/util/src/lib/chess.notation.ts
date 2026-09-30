import { applyMove, inCheck, legalMoves } from './chess.engine';
import { Move, PieceType, Position, fileOf, rankOf, squareName, typeOf } from './chess.types';

type Lettered = Exclude<PieceType, 'p'>;

/** The letters a notation uses for the five pieces that have one (pawns have none). */
export type PieceLetters = Readonly<Record<Lettered, string>>;

export const ENGLISH_LETTERS: PieceLetters = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N' };

/** Long algebraic as UCI writes it: `e2e4`, `e7e8q`. */
export function toUci(m: Move): string {
  return squareName(m.from) + squareName(m.to) + (m.promotion ?? '');
}

/** The legal move `uci` stands for in `pos`, or null. */
export function fromUci(pos: Position, uci: string): Move | null {
  return legalMoves(pos).find(m => toUci(m) === uci) ?? null;
}

/**
 * Short algebraic notation — `e4`, `Sf3`, `exd5`, `Tad1`, `O-O`, `e8D`, with `+` or `#`.
 * `letters` localises the piece letters (German K D T L S). Promotion is written without `=`.
 */
export function toSan(pos: Position, m: Move, letters: PieceLetters = ENGLISH_LETTERS): string {
  let san: string;
  if (m.kind === 'castle') {
    san = fileOf(m.to) === 6 ? 'O-O' : 'O-O-O';
  } else {
    const type = typeOf(m.piece);
    const dest = squareName(m.to);
    const capture = m.captured !== null;
    if (type === 'p') {
      const promotion = m.promotion ? letters[m.promotion as Lettered] : '';
      san = (capture ? squareName(m.from)[0] + 'x' : '') + dest + promotion;
    } else {
      const rivals = legalMoves(pos).filter(o => o.piece === m.piece && o.to === m.to && o.from !== m.from);
      let which = '';
      if (rivals.length) {
        const name = squareName(m.from);
        const sameFile = rivals.some(o => fileOf(o.from) === fileOf(m.from));
        const sameRank = rivals.some(o => rankOf(o.from) === rankOf(m.from));
        which = !sameFile ? name[0] : !sameRank ? name[1] : name;
      }
      san = letters[type as Lettered] + which + (capture ? 'x' : '') + dest;
    }
  }
  const next = applyMove(pos, m);
  if (inCheck(next)) san += legalMoves(next).length === 0 ? '#' : '+';
  return san;
}
