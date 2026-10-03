import { describe, expect, it } from 'vitest';

import { defaultConfig, isNewBest, parseBest, parseConfig } from './memory.storage';

describe('parseConfig', () => {
  it('reads valid settings', () => {
    expect(parseConfig(JSON.stringify({ size: 'large', theme: 'sport', players: 2 })))
      .toEqual({ size: 'large', theme: 'sport', players: 2 });
  });

  it('falls back per field', () => {
    expect(parseConfig(null)).toEqual(defaultConfig());
    expect(parseConfig('{oops')).toEqual(defaultConfig());
    expect(parseConfig(JSON.stringify({ size: 'huge', theme: 'food', players: 3 })))
      .toEqual({ ...defaultConfig(), theme: 'food' });
  });
});

describe('parseBest', () => {
  it('keeps valid entries and drops broken ones', () => {
    const raw = JSON.stringify({ small: { moves: 12, ms: 40_000 }, medium: { moves: -1, ms: 1 }, large: 'x' });
    expect(parseBest(raw)).toEqual({ small: { moves: 12, ms: 40_000 } });
    expect(parseBest(null)).toEqual({});
  });
});

describe('isNewBest', () => {
  const best = { small: { moves: 12, ms: 40_000 } };

  it('prefers fewer moves, then less time', () => {
    expect(isNewBest(best, 'small', 11, 90_000)).toBe(true);
    expect(isNewBest(best, 'small', 12, 30_000)).toBe(true);
    expect(isNewBest(best, 'small', 12, 50_000)).toBe(false);
    expect(isNewBest(best, 'small', 13, 1_000)).toBe(false);
  });

  it('counts any first result as the best', () => {
    expect(isNewBest(best, 'large', 40, 300_000)).toBe(true);
  });
});
