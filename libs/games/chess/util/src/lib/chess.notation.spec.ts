import { describe, expect, it } from 'vitest';
import { parseFen } from './chess.fen';
import { PieceLetters, fromUci, toSan, toUci } from './chess.notation';
import { START_FEN } from './chess.types';

const GERMAN: PieceLetters = { k: 'K', q: 'D', r: 'T', b: 'L', n: 'S' };

function san(fen: string, uci: string, letters?: PieceLetters): string {
  const pos = parseFen(fen);
  const move = fromUci(pos, uci);
  if (!move) throw new Error(`illegal ${uci}`);
  return toSan(pos, move, letters);
}

describe('UCI', () => {
  it('round-trips legal moves and rejects illegal ones', () => {
    const pos = parseFen(START_FEN);
    const e4 = fromUci(pos, 'e2e4');
    expect(e4?.kind).toBe('double');
    expect(toUci(e4!)).toBe('e2e4');
    expect(fromUci(pos, 'e2e5')).toBeNull();
    expect(toUci(fromUci(parseFen('8/P7/8/8/8/8/8/k6K w - - 0 1'), 'a7a8q')!)).toBe('a7a8q');
  });
});

describe('toSan', () => {
  it('writes pawn and piece moves, English and German', () => {
    expect(san(START_FEN, 'e2e4')).toBe('e4');
    expect(san(START_FEN, 'g1f3')).toBe('Nf3');
    expect(san(START_FEN, 'g1f3', GERMAN)).toBe('Sf3');
  });

  it('writes captures', () => {
    expect(san('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2', 'e4d5')).toBe('exd5');
    expect(san('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', 'e5d6')).toBe('exd6');
  });

  it('writes castling', () => {
    expect(san('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1')).toBe('O-O');
    expect(san('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1c1')).toBe('O-O-O');
  });

  it('disambiguates by file, by rank, and by both', () => {
    expect(san('4k3/8/8/8/8/8/8/R4RK1 w - - 0 1', 'a1d1')).toBe('Rad1');
    expect(san('4k3/8/8/8/8/8/8/R4RK1 w - - 0 1', 'a1d1', GERMAN)).toBe('Tad1');
    expect(san('4k3/8/8/R7/8/8/8/R5K1 w - - 0 1', 'a1a3')).toBe('R1a3');
    expect(san('8/7k/8/Q3Q3/8/8/8/Q5K1 w - - 0 1', 'a5c3')).toBe('Qa5c3');
  });

  it('writes promotions, including by capture, with the localised letter', () => {
    expect(san('8/P7/8/8/8/8/8/k6K w - - 0 1', 'a7a8q')).toBe('a8Q+');
    expect(san('8/P7/8/8/8/8/8/k6K w - - 0 1', 'a7a8q', GERMAN)).toBe('a8D+');
    expect(san('1r5k/P7/8/8/8/8/8/7K w - - 0 1', 'a7b8q', GERMAN)).toBe('axb8D+');
  });

  it('marks check and mate', () => {
    expect(san('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'a1a8')).toBe('Ra8+');
    expect(san('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8')).toBe('Ra8#');
  });
});
