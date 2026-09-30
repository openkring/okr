import { describe, expect, it } from 'vitest';

import {
  colorOf, fileOf, makePiece, opponent, parseSquare, rankOf, squareAt, squareName, typeOf,
} from './chess.types';

describe('chess.types', () => {
  it('lays the board out in FEN reading order', () => {
    expect(squareName(0)).toBe('a8');
    expect(squareName(7)).toBe('h8');
    expect(squareName(56)).toBe('a1');
    expect(squareName(60)).toBe('e1');
    expect(squareName(63)).toBe('h1');
    expect(fileOf(60)).toBe(4);
    expect(rankOf(60)).toBe(0);
    expect(squareAt(4, 0)).toBe(60);
  });

  it('parses square names and rejects others', () => {
    expect(parseSquare('e1')).toBe(60);
    expect(parseSquare('a8')).toBe(0);
    expect(parseSquare('i1')).toBeNull();
    expect(parseSquare('e9')).toBeNull();
    expect(parseSquare('')).toBeNull();
  });

  it('reads colour and type from the FEN letter', () => {
    expect(colorOf('K')).toBe('w');
    expect(colorOf('n')).toBe('b');
    expect(typeOf('Q')).toBe('q');
    expect(makePiece('w', 'n')).toBe('N');
    expect(makePiece('b', 'q')).toBe('q');
    expect(opponent('w')).toBe('b');
  });
});
