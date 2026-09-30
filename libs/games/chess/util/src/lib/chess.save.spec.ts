import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, parseSavedGame } from './chess.save';
import { START_FEN } from './chess.types';

const valid = {
  v: 1,
  initialFen: START_FEN,
  moves: ['e2e4', 'e7e5'],
  settings: { mode: 'human', human: 'w', clock: 5, autoFlip: true },
  clock: { remaining: { w: 290_000, b: 280_000 }, running: 'w', since: 123 },
  ended: null,
};

describe('parseSavedGame', () => {
  it('accepts a valid save and returns the clock paused', () => {
    const saved = parseSavedGame(valid);
    expect(saved?.moves).toEqual(['e2e4', 'e7e5']);
    expect(saved?.clock).toEqual({ remaining: { w: 290_000, b: 280_000 }, running: null, since: null });
  });

  it.each([
    ['null', null],
    ['a string', 'nope'],
    ['another version', { ...valid, v: 2 }],
    ['an illegal move list', { ...valid, moves: ['e2e5'] }],
    ['a broken FEN', { ...valid, initialFen: 'x' }],
    ['unknown settings', { ...valid, settings: { ...valid.settings, mode: 'grandmaster' } }],
    ['moves that are not strings', { ...valid, moves: [42] }],
  ])('rejects %s', (_, raw) => {
    expect(parseSavedGame(raw)).toBeNull();
  });

  it('drops a malformed clock but keeps the game', () => {
    expect(parseSavedGame({ ...valid, clock: { remaining: 'x' } })?.clock).toBeNull();
  });

  it('has sensible defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({ mode: 'medium', human: 'w', clock: 0, autoFlip: true });
  });
});
