import { describe, expect, it } from 'vitest';

import {
  MEMORY_LAYOUT,
  MEMORY_SIZES,
  MEMORY_SYMBOLS,
  MEMORY_THEMES,
  MemoryBoard,
  closeMiss,
  dealDeck,
  formatDuration,
  isFinished,
  leaders,
  missPending,
  newBoard,
  reveal,
} from './memory.engine';

/** Deterministic PRNG (mulberry32) so deal tests are repeatable. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fixed board: positions 0/1 are a pair, 2/3 are a pair. */
function board(players = 1): MemoryBoard {
  return { deck: [5, 5, 7, 7], open: [], matched: [], moves: 0, scores: new Array(players).fill(0), current: 0 };
}

describe('layout and themes', () => {
  it('fits every board in a full grid', () => {
    for (const size of MEMORY_SIZES) {
      const { pairs, cols } = MEMORY_LAYOUT[size];
      expect((pairs * 2) % cols).toBe(0);
    }
  });

  it('has enough distinct faces in every theme for the largest board', () => {
    for (const theme of MEMORY_THEMES) {
      const symbols = MEMORY_SYMBOLS[theme];
      expect(new Set(symbols).size).toBe(symbols.length);
      expect(symbols.length).toBeGreaterThanOrEqual(MEMORY_LAYOUT.large.pairs);
    }
  });
});

describe('dealDeck', () => {
  it('deals every chosen pair id exactly twice', () => {
    const deck = dealDeck(12, 20, seeded(1));
    expect(deck).toHaveLength(24);
    const counts = new Map<number, number>();
    for (const id of deck) counts.set(id, (counts.get(id) ?? 0) + 1);
    expect(counts.size).toBe(12);
    expect([...counts.values()].every(n => n === 2)).toBe(true);
    expect([...counts.keys()].every(id => id >= 0 && id < 20)).toBe(true);
  });

  it('shuffles', () => {
    expect(dealDeck(8, 20, seeded(1))).not.toEqual(dealDeck(8, 20, seeded(2)));
  });

  it('caps the number of players', () => {
    expect(newBoard('small', 5, 20, seeded(1)).scores).toHaveLength(2);
    expect(newBoard('small', 0, 20, seeded(1)).scores).toHaveLength(1);
  });
});

describe('a turn', () => {
  it('keeps a found pair open and lets the same player go again', () => {
    let b = board(2);
    expect(reveal(b, 0).outcome).toBe('first');
    b = reveal(b, 0).board;
    const r = reveal(b, 1);
    expect(r.outcome).toBe('match');
    expect(r.board.matched).toEqual([0, 1]);
    expect(r.board.open).toEqual([]);
    expect(r.board.scores).toEqual([1, 0]);
    expect(r.board.current).toBe(0);
    expect(r.board.moves).toBe(1);
  });

  it('shows a miss until it is closed, then passes the turn', () => {
    let b = reveal(board(2), 0).board;
    const r = reveal(b, 2);
    expect(r.outcome).toBe('miss');
    b = r.board;
    expect(missPending(b)).toBe(true);
    expect(reveal(b, 3).outcome).toBe('ignored');
    b = closeMiss(b);
    expect(b.open).toEqual([]);
    expect(b.current).toBe(1);
    expect(b.moves).toBe(1);
  });

  it('keeps the turn with the only player in solo play', () => {
    const b = closeMiss(reveal(reveal(board(), 0).board, 2).board);
    expect(b.current).toBe(0);
  });

  it('ignores open, found and out-of-range cards', () => {
    const b = reveal(board(), 0).board;
    expect(reveal(b, 0).outcome).toBe('ignored');
    expect(reveal(b, 9).outcome).toBe('ignored');
    const found = reveal(b, 1).board;
    expect(reveal(found, 1).outcome).toBe('ignored');
  });

  it('finishes when every card is found', () => {
    let b = board();
    for (const i of [0, 1, 2, 3]) b = reveal(b, i).board;
    expect(isFinished(b)).toBe(true);
  });
});

describe('leaders', () => {
  it('names the winner, or everyone tied', () => {
    expect(leaders({ ...board(2), scores: [3, 5] })).toEqual([1]);
    expect(leaders({ ...board(2), scores: [4, 4] })).toEqual([0, 1]);
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_725_000)).toBe('1:02:05');
  });
});
