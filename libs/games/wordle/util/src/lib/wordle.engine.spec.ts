import { describe, expect, it } from 'vitest';

import { gameStatus, keyboardStates, scoreGuess, shareText, submitGuess, typeInto } from './wordle.engine';
import { WordleGame } from './wordle.types';

const game = (solution: string, guesses: string[] = [], maxTries = 6): WordleGame =>
  ({ mode: 'endless', length: solution.length, maxTries, solution, guesses });

describe('scoreGuess', () => {
  it('scores exact, misplaced and missing letters', () => {
    expect(scoreGuess('BAUM', 'BAUM')).toEqual(['correct', 'correct', 'correct', 'correct']);
    expect(scoreGuess('MAUS', 'BAUM')).toEqual(['present', 'correct', 'correct', 'absent']);
  });

  it('never marks a letter more often than the solution holds it', () => {
    expect(scoreGuess('NNNXX', 'KANNE')).toEqual(['present', 'absent', 'correct', 'absent', 'absent']);
    expect(scoreGuess('EEEEE', 'KANNE')).toEqual(['absent', 'absent', 'absent', 'absent', 'correct']);
  });

  it('lets an exact hit win over an earlier misplaced copy', () => {
    // one A in the solution, at index 1: the exact hit takes it, the leading A gets nothing
    expect(scoreGuess('AAXX', 'BAUM')).toEqual(['absent', 'correct', 'absent', 'absent']);
  });

  it('marks both copies when the solution has two', () => {
    expect(scoreGuess('XNNX', 'NAAN')).toEqual(['absent', 'present', 'present', 'absent']);
  });
});

describe('gameStatus', () => {
  it('is playing, won or lost', () => {
    expect(gameStatus(game('BAUM'))).toBe('playing');
    expect(gameStatus(game('BAUM', ['MAUS', 'BAUM']))).toBe('won');
    expect(gameStatus(game('BAUM', ['MAUS', 'HAUS', 'LAUS'], 3))).toBe('lost');
  });

  it('counts a win on the very last try as won', () => {
    expect(gameStatus(game('BAUM', ['MAUS', 'HAUS', 'BAUM'], 3))).toBe('won');
  });
});

describe('keyboardStates', () => {
  it('keeps the best state per letter', () => {
    const states = keyboardStates(game('BAUM', ['MAUS', 'MOST', 'BRIM']));
    expect(states['M']).toBe('correct');     // present in MAUS, correct in BRIM
    expect(states['A']).toBe('correct');
    expect(states['S']).toBe('absent');
    expect(states['B']).toBe('correct');
    expect(states['Z']).toBeUndefined();
  });
});

describe('typeInto', () => {
  it('appends transcribed letters that fit', () => {
    expect(typeInto('K', 'ä', 5)).toBe('KAE');
    expect(typeInto('', 'x', 4)).toBe('X');
  });

  it('adds nothing when the letters would overflow the row', () => {
    expect(typeInto('KAES', 'ä', 5)).toBe('KAES');
    expect(typeInto('BAUM', 'x', 4)).toBe('BAUM');
    expect(typeInto('BA', '1', 4)).toBe('BA');
  });
});

describe('submitGuess', () => {
  it('appends a complete row, without any dictionary check', () => {
    const result = submitGuess(game('BAUM'), 'XQZY');
    expect(result).toEqual({ ok: true, game: game('BAUM', ['XQZY']) });
  });

  it('refuses an incomplete row', () => {
    expect(submitGuess(game('BAUM'), 'BAU')).toEqual({ ok: false, reason: 'too-short' });
  });

  it('refuses once the round is over', () => {
    expect(submitGuess(game('BAUM', ['BAUM']), 'MAUS')).toEqual({ ok: false, reason: 'finished' });
    expect(submitGuess(game('BAUM', ['MAUS'], 1), 'BAUM')).toEqual({ ok: false, reason: 'finished' });
  });
});

describe('shareText', () => {
  it('shows the score and one row of squares per guess, never the letters', () => {
    const text = shareText(game('BAUM', ['MAUS', 'BAUM']), 'Wordle 29.09.2026');
    expect(text).toBe('Wordle 29.09.2026 2/6\n\n🟨🟩🟩⬜\n🟩🟩🟩🟩');
  });

  it('shows X for a lost round', () => {
    expect(shareText(game('BAUM', ['MAUS'], 1), 'Wordle').split('\n')[0]).toBe('Wordle X/1');
  });
});
