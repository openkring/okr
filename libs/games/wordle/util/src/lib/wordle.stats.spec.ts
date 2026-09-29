import { describe, expect, it } from 'vitest';

import { currentStreak, emptyStats, recordResult, winRate } from './wordle.stats';
import { WordleGame } from './wordle.types';

const daily = (day: string, guesses: string[], maxTries = 6): WordleGame =>
  ({ mode: 'daily', day, length: 4, maxTries, solution: 'BAUM', guesses });
const endless = (guesses: string[], maxTries = 6): WordleGame =>
  ({ mode: 'endless', length: 4, maxTries, solution: 'BAUM', guesses });

describe('recordResult', () => {
  it('ignores a round still being played', () => {
    const stats = emptyStats();
    expect(recordResult(stats, endless(['MAUS']))).toBe(stats);
  });

  it('counts wins, the distribution and the endless streak', () => {
    let s = recordResult(emptyStats(), endless(['MAUS', 'BAUM']));
    s = recordResult(s, endless(['BAUM']));
    expect(s).toEqual({ played: 2, won: 2, streak: 2, maxStreak: 2, dist: { 1: 1, 2: 1 } });
    s = recordResult(s, endless(['MAUS'], 1));
    expect(s.streak).toBe(0);
    expect(s.maxStreak).toBe(2);
    expect(winRate(s)).toBe(67);
  });

  it('continues a daily streak only on the next calendar day', () => {
    let s = recordResult(emptyStats(), daily('20260929', ['BAUM']));
    s = recordResult(s, daily('20260930', ['BAUM']));
    expect(s.streak).toBe(2);
    expect(s.lastDay).toBe('20260930');
    s = recordResult(s, daily('20261002', ['BAUM']));
    expect(s.streak).toBe(1);
    expect(s.maxStreak).toBe(2);
  });
});

describe('currentStreak', () => {
  it('reports a daily streak as broken once a day was skipped', () => {
    const s = recordResult(emptyStats(), daily('20260929', ['BAUM']));
    expect(currentStreak(s, '20260929', 'daily')).toBe(1);
    expect(currentStreak(s, '20260930', 'daily')).toBe(1);
    expect(currentStreak(s, '20261001', 'daily')).toBe(0);
  });
});

describe('winRate', () => {
  it('is 0 before the first round', () => {
    expect(winRate(emptyStats())).toBe(0);
  });
});
