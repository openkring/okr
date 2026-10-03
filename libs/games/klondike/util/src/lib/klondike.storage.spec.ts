import { describe, expect, it } from 'vitest';

import { deal } from './klondike.engine';
import { KlondikeGame, isNewBest, parseBest, parseGame, serializeBest, serializeGame } from './klondike.storage';

/** mulberry32, as in the engine spec (a spec must not import another spec — its tests would run twice). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function game(): KlondikeGame {
  return { state: deal(3, rng(1)), elapsedMs: 4200, drawNext: 1, won: false };
}

/** The saved JSON with one part replaced, parsed again. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tampered(edit: (raw: Record<string, any>) => void): KlondikeGame | null {
  const raw = JSON.parse(serializeGame(game()));
  edit(raw);
  return parseGame(JSON.stringify(raw));
}

describe('parseGame', () => {
  it('round-trips a saved game', () => {
    const g = game();
    expect(parseGame(serializeGame(g))).toEqual(g);
  });

  it('treats missing or broken entries as absent', () => {
    expect(parseGame(null)).toBeNull();
    expect(parseGame('{not json')).toBeNull();
    expect(parseGame('[]')).toBeNull();
  });

  it('discards an entry from another storage version', () => {
    expect(tampered(raw => { raw['v'] = 0; })).toBeNull();
  });

  it('rejects a deck that is not exactly the 52 cards', () => {
    expect(tampered(raw => { raw['state'].stock.pop(); })).toBeNull();
    expect(tampered(raw => { raw['state'].stock[0] = raw['state'].stock[1]; })).toBeNull();
    expect(tampered(raw => { raw['state'].stock[0].rank = 14; })).toBeNull();
  });

  it('rejects a broken layout or setting', () => {
    expect(tampered(raw => { raw['state'].tableau.pop(); })).toBeNull();
    expect(tampered(raw => { raw['state'].foundations.pop(); })).toBeNull();
    expect(tampered(raw => { raw['state'].drawCount = 2; })).toBeNull();
    expect(tampered(raw => { raw['drawNext'] = 5; })).toBeNull();
    expect(tampered(raw => { raw['elapsedMs'] = -1; })).toBeNull();
  });
});

describe('best times', () => {
  it('keeps only valid entries', () => {
    expect(parseBest(null)).toEqual({});
    expect(parseBest('{"1":5000,"3":-1,"x":3}')).toEqual({ '1': 5000 });
    expect(parseBest(serializeBest({ '3': 61000 }))).toEqual({ '3': 61000 });
  });

  it('is beaten by a faster game with the same draw rule', () => {
    expect(isNewBest({}, 1, 900)).toBe(true);
    expect(isNewBest({ '1': 800 }, 1, 900)).toBe(false);
    expect(isNewBest({ '1': 800 }, 1, 700)).toBe(true);
    expect(isNewBest({ '1': 800 }, 3, 900)).toBe(true);
  });
});
