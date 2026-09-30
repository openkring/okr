import { describe, expect, it } from 'vitest';
import { parseFen } from './chess.fen';
import {
  capturedPieces, gameResult, hasMatingMaterial, insufficientMaterial, materialBalance, replay, undoLength,
} from './chess.game';
import { START_FEN } from './chess.types';

const board = (fen: string) => parseFen(fen).board;
const resultOf = (fen: string) => gameResult([parseFen(fen)]);

describe('replay', () => {
  it('replays legal moves', () => {
    const r = replay(START_FEN, ['e2e4', 'e7e5']);
    expect(r?.positions).toHaveLength(3);
    expect(r?.moves).toHaveLength(2);
  });

  it('returns null for an illegal move or a broken FEN', () => {
    expect(replay(START_FEN, ['e2e4', 'e2e4'])).toBeNull();
    expect(replay('nonsense', [])).toBeNull();
  });
});

describe('gameResult', () => {
  it('sees checkmate (fool\'s mate)', () => {
    const r = replay(START_FEN, ['f2f3', 'e7e5', 'g2g4', 'd8h4'])!;
    expect(gameResult(r.positions)).toEqual({ kind: 'checkmate', winner: 'b' });
  });

  it('sees stalemate', () => {
    expect(resultOf('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toEqual({ kind: 'stalemate', winner: null });
  });

  it('sees insufficient material', () => {
    expect(resultOf('8/8/8/4k3/8/8/8/4K3 w - - 0 1')?.kind).toBe('insufficient');
    expect(resultOf('8/8/8/4k3/8/8/8/2B1K3 w - - 0 1')?.kind).toBe('insufficient');
    expect(resultOf('5b2/8/8/4k3/8/8/8/2B1K3 w - - 0 1')?.kind).toBe('insufficient');
    expect(resultOf('2b5/8/8/4k3/8/8/8/2B1K3 w - - 0 1')).toBeNull();
    expect(resultOf('2n5/8/8/4k3/8/8/8/2N1K3 w - - 0 1')).toBeNull();
    expect(resultOf('8/8/8/4k3/8/8/4P3/4K3 w - - 0 1')).toBeNull();
  });

  it('applies the 50-move rule', () => {
    expect(resultOf('8/8/8/4k3/8/8/8/R3K3 w - - 100 80')).toEqual({ kind: 'fifty-move', winner: null });
    expect(resultOf('8/8/8/4k3/8/8/8/R3K3 w - - 99 80')).toBeNull();
  });

  it('sees threefold repetition, not twofold', () => {
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
    expect(gameResult(replay(START_FEN, shuffle)!.positions)).toBeNull();
    expect(gameResult(replay(START_FEN, [...shuffle, ...shuffle])!.positions))
      .toEqual({ kind: 'repetition', winner: null });
  });

  it('lets checkmate win over the 50-move counter', () => {
    expect(resultOf('R5k1/5ppp/8/8/8/8/8/6K1 b - - 100 80')?.kind).toBe('checkmate');
  });
});

describe('hasMatingMaterial (flag-fall rule)', () => {
  it('knows who could still mate', () => {
    expect(hasMatingMaterial(board('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'), 'w')).toBe(true);
    expect(hasMatingMaterial(board('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'), 'b')).toBe(false);
    expect(hasMatingMaterial(board('4k3/8/8/8/8/8/8/N3K3 w - - 0 1'), 'w')).toBe(false);
    expect(hasMatingMaterial(board('4k3/4p3/8/8/8/8/8/N3K3 w - - 0 1'), 'w')).toBe(true);
    expect(hasMatingMaterial(board('4k3/8/8/8/8/8/8/NN2K3 w - - 0 1'), 'w')).toBe(true);
  });
});

describe('material', () => {
  it('lists what each side took, most valuable first', () => {
    const r = replay(START_FEN, ['e2e4', 'd7d5', 'e4d5', 'd8d5'])!;
    expect(capturedPieces(r.moves)).toEqual({ w: ['p'], b: ['p'] });
  });

  it('counts the balance in pawns', () => {
    expect(materialBalance(board(START_FEN))).toBe(0);
    expect(materialBalance(board('4k3/8/8/8/8/8/8/Q3K3 w - - 0 1'))).toBe(9);
    expect(materialBalance(board('4k3/8/8/8/8/8/8/Q3K3 w - - 0 1'.replace('Q', 'n')))).toBe(-3);
  });

  it('insufficientMaterial ignores kings only', () => {
    expect(insufficientMaterial(board('4k3/8/8/8/8/8/8/4K3 w - - 0 1'))).toBe(true);
    expect(insufficientMaterial(board('4k3/8/8/8/8/8/8/R3K3 w - - 0 1'))).toBe(false);
  });
});

describe('undoLength', () => {
  it('takes back one half-move between two people', () => {
    expect(undoLength(3, 'w', null)).toBe(2);
    expect(undoLength(0, 'w', null)).toBeNull();
  });

  // Rule: remove the person's last move and whatever the computer played after it.
  it('goes back to the person\'s own turn against the computer', () => {
    expect(undoLength(2, 'w', 'w')).toBe(0);   // person e4, computer e5 → before e4
    expect(undoLength(1, 'w', 'w')).toBe(0);   // person e4, computer still thinking → before e4
    expect(undoLength(3, 'w', 'w')).toBe(2);   // w b w, the last one is the person's → drop it only
    expect(undoLength(4, 'w', 'b')).toBe(3);   // person plays black and just moved → drop that move
    expect(undoLength(5, 'w', 'b')).toBe(3);   // …and the computer already answered → drop both
    expect(undoLength(2, 'w', 'b')).toBe(1);   // back to after the computer's opening move
  });

  it('has nothing to undo while only the computer has moved', () => {
    expect(undoLength(1, 'w', 'b')).toBeNull();
    expect(undoLength(0, 'w', 'w')).toBeNull();
  });
});
