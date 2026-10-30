import { describe, expect, it } from 'vitest';

import {
  MurdokuGame,
  emptyStats,
  parseGame,
  parseStats,
  recordGivenUp,
  recordSolved,
  serializeGame,
  serializeStats,
} from './murdoku.storage';

const game: MurdokuGame = {
  difficulty: 'easy',
  seed: 4242,
  placement: [0, null, 10, null],
  locked: [2],
  marks: [3, 7],
  hints: 1,
  elapsedMs: 61_000,
  phase: 'play',
};

describe('parseGame', () => {
  it('round-trips a game', () => {
    expect(parseGame(serializeGame(game))).toEqual(game);
  });

  it('rejects junk and inconsistent entries', () => {
    expect(parseGame(null)).toBeNull();
    expect(parseGame('{nope')).toBeNull();
    expect(parseGame(serializeGame({ ...game, difficulty: 'insane' as never }))).toBeNull();
    expect(parseGame(serializeGame({ ...game, placement: [0, null, 10] }))).toBeNull();
    expect(parseGame(serializeGame({ ...game, placement: [0, null, 16, null] }))).toBeNull();
    expect(parseGame(serializeGame({ ...game, locked: [4] }))).toBeNull();
    expect(parseGame(serializeGame({ ...game, phase: 'won' as never }))).toBeNull();
  });
});

describe('stats', () => {
  it('reads anything unreadable as zero', () => {
    expect(parseStats(null)).toEqual(emptyStats());
    expect(parseStats('[]')).toEqual(emptyStats());
  });

  it('counts a solve, keeps the best clean time and grows the streak', () => {
    let s = recordSolved(emptyStats(), 'medium', 90_000, 0);
    s = recordSolved(s, 'medium', 120_000, 0);
    s = recordSolved(s, 'medium', 30_000, 2);
    expect(s.medium).toEqual({ solved: 3, bestMs: 90_000 });
    expect(s.streak).toBe(3);
    expect(parseStats(serializeStats(s))).toEqual(s);
  });

  it('ends the streak on giving up', () => {
    const s = recordGivenUp(recordSolved(emptyStats(), 'easy', 1000, 0));
    expect(s.streak).toBe(0);
    expect(s.easy.solved).toBe(1);
  });
});
