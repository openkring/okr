import { describe, expect, it } from 'vitest';
import { AvatarInfo } from '@okr/shared-models';
import { DEFAULT_JASS_CONFIG } from './jass.config';
import { addHand, createGame, totals } from './jass.engine';
import { parsePending, parseStoredGame } from './jass.storage';

const p = (n: number) => ({ avatar: { key: 'k' + n, name1: '', name2: 'P' + n, label: '', modelType: 'person' } as AvatarInfo });
const game = addHand(
  createGame('schieber', [p(0), p(1), p(2), p(3)], DEFAULT_JASS_CONFIG, { id: 'g', now: 't' }),
  { trumpMakerIdx: 0, trump: 'eicheln', cardPoints: { a: 100, b: 57 }, weis: {} },
);
const clone = () => JSON.parse(JSON.stringify(game));

describe('parseStoredGame', () => {
  it('accepts a game written by the store', () => {
    const g = parseStoredGame(clone());
    expect(g).not.toBeNull();
    expect(totals(g!)).toEqual({ a: 100, b: 57 });
  });

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['an unknown variant', { ...clone(), variant: 'molotow' }],
    ['a null hand', { ...clone(), hands: [null] }],
    ['a hand without weis', { ...clone(), hands: [{ trumpMakerIdx: 0, trump: 'eicheln', cardPoints: {} }] }],
    ['a hand without cardPoints', { ...clone(), hands: [{ trumpMakerIdx: 0, trump: 'eicheln', weis: {} }] }],
    ['a side without playerIdx', { ...clone(), sides: [{ id: 'a' }, { id: 'b', playerIdx: [1, 3] }] }],
    ['a side pointing past the players', { ...clone(), sides: [{ id: 'a', playerIdx: [0, 7] }, { id: 'b', playerIdx: [1, 3] }] }],
    ['a player without avatar', { ...clone(), players: [{}, p(1), p(2), p(3)] }],
  ])('rejects %s instead of crashing later', (_label, raw) => {
    expect(parseStoredGame(raw)).toBeNull();
  });

  it('keeps valid tapped strokes and drops damaged ones', () => {
    const chalks = [
      { sideId: 'a', unit: 50, afterHand: 1 }, { sideId: 'x', unit: 50, afterHand: 1 },
      { sideId: 'b', unit: 30, afterHand: 0 }, { sideId: 'b', unit: 20, afterHand: 9 }, null,
    ];
    expect(parseStoredGame({ ...clone(), chalks })!.chalks).toEqual([{ sideId: 'a', unit: 50, afterHand: 1 }]);
    expect(parseStoredGame({ ...clone(), chalks: 'junk' })!.chalks).toEqual([]);
  });

  it('repairs a broken config inside an otherwise valid game', () => {
    expect(parseStoredGame({ ...clone(), config: 'junk' })!.config).toEqual(DEFAULT_JASS_CONFIG);
  });
});

describe('parsePending', () => {
  const diff = createGame('differenzler', [p(0), p(1), p(2)], DEFAULT_JASS_CONFIG, { id: 'd', now: 't' });
  it('keeps announcements that fit the running Differenzler', () => {
    expect(parsePending([50, 50, 57], diff)).toEqual([50, 50, 57]);
  });
  it('drops announcements of the wrong length, variant or range', () => {
    expect(parsePending([50, 50], diff)).toBeNull();
    expect(parsePending([50, 50, 200], diff)).toBeNull();
    expect(parsePending([50, 50, 57], game)).toBeNull();
    expect(parsePending([50, 50, 57], null)).toBeNull();
    expect(parsePending('x', diff)).toBeNull();
  });
});
