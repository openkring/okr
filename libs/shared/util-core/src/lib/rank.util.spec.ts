import { describe, expect, it } from 'vitest';
import { rankBetween, rankForIndex } from './rank.util';

describe('rankBetween', () => {
  it('returns a rank between two unbounded ends', () => {
    const rank = rankBetween('', '');
    expect(rank.length).toBeGreaterThan(0);
  });

  it('appends after a lower bound', () => {
    const rank = rankBetween('V', '');
    expect(rank > 'V').toBe(true);
  });

  it('prepends before an upper bound', () => {
    const rank = rankBetween('', 'V');
    expect(rank < 'V').toBe(true);
  });

  it('inserts strictly between two neighbours', () => {
    const rank = rankBetween('a', 'b');
    expect(rank > 'a').toBe(true);
    expect(rank < 'b').toBe(true);
  });

  it('inserts between adjacent ranks by growing the string', () => {
    const first = rankBetween('a', 'b');   // 'aV'
    const second = rankBetween('a', first);
    expect(second > 'a').toBe(true);
    expect(second < first).toBe(true);
  });

  it('survives 100 repeated insertions at the same position', () => {
    let lower = '';
    const upper = 'V';
    for (let i = 0; i < 100; i++) {
      const rank = rankBetween(lower, upper);
      expect(rank > lower).toBe(true);
      expect(rank < upper).toBe(true);
      lower = rank;
    }
  });

  it('throws when lower is not below upper', () => {
    expect(() => rankBetween('b', 'a')).toThrow();
    expect(() => rankBetween('a', 'a')).toThrow();
  });

  it('throws on a trailing zero, which would break the invariant', () => {
    expect(() => rankBetween('a0', '')).toThrow();
  });
});

describe('rankForIndex', () => {
  it('is strictly increasing', () => {
    const ranks = Array.from({ length: 200 }, (_, i) => rankForIndex(i));
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i] > ranks[i - 1]).toBe(true);
    }
  });

  it('never ends in a zero, so its output is a legal rankBetween argument', () => {
    for (let i = 0; i < 200; i++) {
      expect(rankForIndex(i).endsWith('0')).toBe(false);
    }
  });

  it('leaves room to insert between two consecutive positions', () => {
    const rank = rankBetween(rankForIndex(0), rankForIndex(1));
    expect(rank > rankForIndex(0)).toBe(true);
    expect(rank < rankForIndex(1)).toBe(true);
  });
});
