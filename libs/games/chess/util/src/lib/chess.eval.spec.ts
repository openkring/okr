import { describe, expect, it } from 'vitest';
import { evaluate } from './chess.eval';
import { parseFen } from './chess.fen';
import { START_FEN } from './chess.types';

describe('evaluate', () => {
  it('is 0 in the symmetric start position', () => {
    expect(evaluate(parseFen(START_FEN))).toBe(0);
  });

  it('scores from the side to move', () => {
    const upWhite = evaluate(parseFen('4k3/8/8/8/8/8/8/Q3K3 w - - 0 1'));
    const upWhiteBlackToMove = evaluate(parseFen('4k3/8/8/8/8/8/8/Q3K3 b - - 0 1'));
    expect(upWhite).toBeGreaterThan(800);
    expect(upWhiteBlackToMove).toBe(-upWhite);
  });

  it('prefers a centralised knight', () => {
    const rim = evaluate(parseFen('4k3/8/8/8/8/8/8/N3K3 w - - 0 1'));
    const centre = evaluate(parseFen('4k3/8/8/8/3N4/8/8/4K3 w - - 0 1'));
    expect(centre).toBeGreaterThan(rim);
  });
});
