import { describe, expect, it } from 'vitest';
import { chooseMove } from './chess.ai';
import { applyMove, legalMoves } from './chess.engine';
import { parseFen } from './chess.fen';
import { gameResult } from './chess.game';
import { toUci } from './chess.notation';
import { START_FEN } from './chess.types';

const fixed = () => 0.42;
const deep = { budgetMs: 60_000, random: fixed };

describe('chooseMove', () => {
  it('returns null without a legal move', () => {
    expect(chooseMove(parseFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), { level: 'medium' })).toBeNull();
  });

  it('finds mate in one', () => {
    const move = chooseMove(parseFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'), { level: 'medium', maxDepth: 2, ...deep });
    expect(toUci(move!)).toBe('a1a8');
  });

  it('finds mate in one even on the 100th half-move (checkmate outranks the fifty-move draw)', () => {
    const move = chooseMove(parseFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 99 80'),
      { level: 'medium', maxDepth: 2, budgetMs: 60_000, random: fixed });
    expect(toUci(move!)).toBe('a1a8');
  });

  it('finds mate in two against every defence', { timeout: 60_000 }, () => {
    const start = parseFen('7k/8/8/8/8/8/8/RR4K1 w - - 0 1');
    const first = chooseMove(start, { level: 'medium', maxDepth: 4, ...deep })!;
    const afterFirst = applyMove(start, first);
    for (const reply of legalMoves(afterFirst)) {
      const afterReply = applyMove(afterFirst, reply);
      const mate = chooseMove(afterReply, { level: 'medium', maxDepth: 2, ...deep })!;
      expect(gameResult([applyMove(afterReply, mate)])?.kind).toBe('checkmate');
    }
  });

  it('takes an unprotected queen', () => {
    const move = chooseMove(parseFen('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1'), { level: 'medium', maxDepth: 3, ...deep });
    expect(toUci(move!)).toBe('d1d5');
  });

  it('answers with a legal move at every level, within its budget', () => {
    const pos = parseFen(START_FEN);
    const legal = legalMoves(pos).map(toUci);
    for (const level of ['easy', 'medium', 'hard'] as const) {
      const started = Date.now();
      const move = chooseMove(pos, { level, budgetMs: 100, random: fixed });
      expect(legal).toContain(toUci(move!));
      expect(Date.now() - started).toBeLessThan(1500);
    }
  });

  it('is deterministic with an injected random source', () => {
    const pos = parseFen(START_FEN);
    const a = chooseMove(pos, { level: 'medium', maxDepth: 2, ...deep });
    const b = chooseMove(pos, { level: 'medium', maxDepth: 2, ...deep });
    expect(toUci(a!)).toBe(toUci(b!));
  });

  it('easy sometimes plays a random legal move', () => {
    const pos = parseFen(START_FEN);
    const move = chooseMove(pos, { level: 'easy', random: () => 0.1 });
    expect(legalMoves(pos).map(toUci)).toContain(toUci(move!));
  });
});
