import { describe, expect, it } from 'vitest';

import { deal } from './mahjong.engine';
import { isNewBest, parseBest, parseConfig, parseGame, serializeBest, serializeGame } from './mahjong.storage';

describe('saved game', () => {
  const game = { state: deal('pyramid'), elapsedMs: 42_000, won: false };

  it('round-trips', () => {
    expect(parseGame(serializeGame(game))).toEqual(game);
  });

  it('treats missing, broken or foreign entries as absent', () => {
    expect(parseGame(null)).toBeNull();
    expect(parseGame('{nope')).toBeNull();
    expect(parseGame(JSON.stringify({ ...game, v: 99 }))).toBeNull();
    expect(parseGame(JSON.stringify({ v: 1, ...game, elapsedMs: -1 }))).toBeNull();
  });

  it('rejects a board whose tiles no longer pair up', () => {
    const kinds = game.state.kinds.slice();
    kinds[0] = kinds[0] === 'dot1' ? 'dot2' : 'dot1';
    expect(parseGame(serializeGame({ ...game, state: { ...game.state, kinds } }))).toBeNull();
  });

  it('rejects a board of the wrong size for its layout', () => {
    const state = { ...game.state, layout: 'pagoda' as const };
    expect(parseGame(serializeGame({ ...game, state }))).toBeNull();
  });
});

describe('best times', () => {
  it('round-trips and drops malformed layouts', () => {
    expect(parseBest(serializeBest({ pagoda: 300_000 }))).toEqual({ pagoda: 300_000 });
    expect(parseBest(JSON.stringify({ pagoda: 'fast', towers: 0, castle: 5 }))).toEqual({});
  });

  it('beats a slower time or an empty slot', () => {
    expect(isNewBest({}, 'towers', 999)).toBe(true);
    expect(isNewBest({ towers: 500 }, 'towers', 400)).toBe(true);
    expect(isNewBest({ towers: 500 }, 'towers', 500)).toBe(false);
  });
});

describe('settings', () => {
  it('defaults to not dimming locked tiles', () => {
    expect(parseConfig(null)).toEqual({ dimLocked: false });
    expect(parseConfig('{"dimLocked":true}')).toEqual({ dimLocked: true });
  });
});
