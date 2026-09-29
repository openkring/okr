import { describe, expect, it } from 'vitest';

import {
  ADJACENT, Cell, MILLS, MuehleState, Player,
  applyMove, canFly, createGame, legalMoves, play, removableStones, stoneCount,
} from './muehle.engine';
import { chooseMove } from './muehle.ai';

/** Builds a moving-phase state from a board spec like { W: [0,1], B: [5] }. */
function position(stones: Partial<Record<Player, number[]>>, opts: Partial<MuehleState> = {}): MuehleState {
  const board: Cell[] = Array(24).fill(null);
  for (const p of stones.W ?? []) board[p] = 'W';
  for (const p of stones.B ?? []) board[p] = 'B';
  return { ...createGame(), board, inHand: { W: 0, B: 0 }, ...opts };
}

/** Deterministic LCG, so the self-play tests are reproducible. */
function seeded(seed: number): () => number {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

describe('muehle engine', () => {
  it('has symmetric adjacency and mills made of adjacent points', () => {
    ADJACENT.forEach((ns, p) => ns.forEach(n => expect(ADJACENT[n]).toContain(p)));
    for (const [a, b, c] of MILLS) {
      expect(ADJACENT[a]).toContain(b);
      expect(ADJACENT[b]).toContain(c);
    }
    expect(MILLS).toHaveLength(16);
  });

  it('opens with 24 placements, white first', () => {
    const g = createGame();
    expect(g.turn).toBe('W');
    expect(legalMoves(g)).toHaveLength(24);
  });

  it('requires a removal when a placement closes a mill', () => {
    let g = createGame();
    g = play(g, { from: null, to: 0, remove: null });
    g = play(g, { from: null, to: 9, remove: null });
    g = play(g, { from: null, to: 1, remove: null });
    g = play(g, { from: null, to: 10, remove: null });
    const removals = legalMoves(g).filter(m => m.to === 2).map(m => m.remove as number).sort((a, b) => a - b);
    expect(removals).toEqual([9, 10]);
    expect(() => play(g, { from: null, to: 2, remove: null })).toThrow();
    g = play(g, { from: null, to: 2, remove: 9 });
    expect(g.board[9]).toBeNull();
    expect(stoneCount(g, 'B')).toBe(8);
  });

  it('protects stones in a mill unless all stones are in mills', () => {
    const board: Cell[] = Array(24).fill(null);
    [0, 1, 2, 21].forEach(p => (board[p] = 'B'));
    expect(removableStones(board, 'W')).toEqual([21]);
    board[21] = null;
    expect(removableStones(board, 'W')).toEqual([0, 1, 2]);
  });

  it('only allows steps to adjacent empty points in the moving phase', () => {
    const g = position({ W: [0, 4, 23, 13], B: [1, 9, 20, 22] });
    expect(legalMoves(g).filter(m => m.from === 0)).toHaveLength(0);
    const from4 = legalMoves(g).filter(m => m.from === 4).map(m => m.to).sort((a, b) => a - b);
    expect(from4).toEqual([3, 5, 7]);
  });

  it('lets a player with three stones fly anywhere', () => {
    const g = position({ W: [0, 4, 23], B: [1, 9, 20, 22] });
    expect(canFly(g)).toBe(true);
    const targets = new Set(legalMoves(g).filter(m => m.from === 0).map(m => m.to));
    expect(targets.size).toBe(24 - 7);
  });

  it('wins by reducing the opponent to two stones', () => {
    const g = position({ W: [0, 1, 10], B: [5, 20, 22] }, { turn: 'W' });
    expect(play(g, { from: 10, to: 9, remove: null }).result).toBeNull();
    const g2 = position({ W: [0, 1, 14], B: [5, 20, 22] });
    const win = play(g2, { from: 14, to: 2, remove: 5 });
    expect(win.result).toEqual({ kind: 'win', winner: 'W', reason: 'fewer-than-three' });
  });

  it('loses when the player to move is blocked', () => {
    const g = position({ W: [1, 9, 3, 13, 12], B: [0, 2, 14, 23] }, { turn: 'W' });
    expect(play(g, { from: 12, to: 8, remove: null }).result).toBeNull();
    const g2 = position({ W: [1, 9, 13, 22, 3], B: [0, 2, 14, 23] }, { turn: 'W' });
    const blocked = play(g2, { from: 3, to: 4, remove: null });
    expect(blocked.result).toEqual({ kind: 'win', winner: 'W', reason: 'no-moves' });
  });

  it('always terminates random self-play with a result', () => {
    const rnd = seeded(42);
    for (let game = 0; game < 200; game++) {
      let g = createGame();
      while (!g.result) {
        const moves = legalMoves(g);
        expect(moves.length).toBeGreaterThan(0);
        g = applyMove(g, moves[Math.floor(rnd() * moves.length)]);
        expect(g.ply).toBeLessThan(2000);
      }
    }
  });
});

describe('muehle ai', () => {
  it('takes an immediate mill and the winning removal', () => {
    const g = position({ W: [0, 1, 14], B: [5, 20, 22] });
    const m = chooseMove(g, 'medium', () => 0);
    expect({ from: m?.from, to: m?.to }).toEqual({ from: 14, to: 2 });
  });

  it('blocks an opponent mill threat while placing', () => {
    let g = createGame();
    g = play(g, { from: null, to: 0, remove: null });
    g = play(g, { from: null, to: 23, remove: null });
    g = play(g, { from: null, to: 1, remove: null });
    expect(chooseMove(g, 'medium', () => 0)?.to).toBe(2);
  });

  it('plays medium stronger than easy', () => {
    const rnd = seeded(7);
    let mediumWins = 0;
    let easyWins = 0;
    for (let i = 0; i < 6; i++) {
      let g = createGame(i % 2 ? 'W' : 'B');
      while (!g.result) {
        const move = chooseMove(g, g.turn === 'W' ? 'medium' : 'easy', rnd);
        if (!move) break;
        g = applyMove(g, move);
      }
      if (g.result?.kind === 'win') {
        if (g.result.winner === 'W') mediumWins++;
        else easyWins++;
      }
    }
    expect(mediumWins).toBeGreaterThan(easyWins);
  });
});
