import { describe, expect, it } from 'vitest';

import { emptyStats } from './wordle.stats';
import { defaultConfig, parseConfig, parseGame, parseStats, wordleGameKey } from './wordle.storage';

describe('parseConfig', () => {
  it('falls back to the defaults for missing or broken input', () => {
    expect(parseConfig(null)).toEqual(defaultConfig());
    expect(parseConfig('{nope')).toEqual(defaultConfig());
    expect(defaultConfig()).toEqual({ mode: 'daily', length: 5, maxTries: 6 });
  });

  it('keeps each valid field on its own', () => {
    expect(parseConfig(JSON.stringify({ mode: 'endless', length: 9, maxTries: 8 })))
      .toEqual({ mode: 'endless', length: 5, maxTries: 8 });
    expect(parseConfig(JSON.stringify({ mode: 'x', length: 7, maxTries: 2 })))
      .toEqual({ mode: 'daily', length: 7, maxTries: 6 });
  });
});

describe('parseGame', () => {
  const ok = { mode: 'daily', day: '20260929', length: 4, maxTries: 6, solution: 'BAUM', guesses: ['MAUS'] };

  it('accepts a consistent saved round', () => {
    expect(parseGame(JSON.stringify(ok))).toEqual(ok);
    expect(parseGame(JSON.stringify({ ...ok, mode: 'endless', day: undefined })))
      .toEqual({ mode: 'endless', length: 4, maxTries: 6, solution: 'BAUM', guesses: ['MAUS'] });
  });

  it('rejects anything inconsistent', () => {
    expect(parseGame(null)).toBeNull();
    expect(parseGame('[]')).toBeNull();
    expect(parseGame(JSON.stringify({ ...ok, solution: 'BAUME' }))).toBeNull();
    expect(parseGame(JSON.stringify({ ...ok, guesses: ['MAU'] }))).toBeNull();
    expect(parseGame(JSON.stringify({ ...ok, guesses: ['maus'] }))).toBeNull();
    expect(parseGame(JSON.stringify({ ...ok, maxTries: 1, guesses: ['MAUS', 'HAUS'] }))).toBeNull();
    expect(parseGame(JSON.stringify({ ...ok, day: undefined }))).toBeNull();
  });
});

describe('parseStats', () => {
  it('reads valid stats and drops bogus distribution entries', () => {
    const raw = JSON.stringify({ played: 3, won: 2, streak: 1, maxStreak: 2, dist: { 3: 1, 4: 1, 99: 5, x: 1 }, lastDay: '20260929' });
    expect(parseStats(raw)).toEqual({ played: 3, won: 2, streak: 1, maxStreak: 2, dist: { 3: 1, 4: 1 }, lastDay: '20260929' });
  });

  it('starts fresh from broken input', () => {
    expect(parseStats('{"played":-1}')).toEqual(emptyStats());
    expect(parseStats(null)).toEqual(emptyStats());
  });
});

describe('wordleGameKey', () => {
  it('keeps one daily round per length and one endless round', () => {
    expect(wordleGameKey('daily', 5)).toBe('wordle.game.daily.5');
    expect(wordleGameKey('endless', 5)).toBe(wordleGameKey('endless', 7));
  });
});
