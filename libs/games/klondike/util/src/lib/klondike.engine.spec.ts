import { describe, expect, it } from 'vitest';

import { Card, KlondikeState, Suit, deal, draw, formatDuration, newDeck, recycle } from './klondike.engine';

/** mulberry32 — a small seeded generator so deals are reproducible. */
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

const RANKS: Record<string, number> = { A: 1, J: 11, Q: 12, K: 13 };

/** 'QH' → queen of hearts, face up; a leading '_' deals it face down. */
function c(code: string): Card {
  const faceUp = !code.startsWith('_');
  const s = faceUp ? code : code.slice(1);
  const r = s.slice(0, -1);
  return { suit: s.slice(-1) as Suit, rank: RANKS[r] ?? Number(r), faceUp };
}
const cards = (...codes: string[]): Card[] => codes.map(c);
const cols = (...piles: Card[][]): Card[][] => [...piles, ...Array.from({ length: 7 - piles.length }, () => [])];

function state(patch: Partial<KlondikeState> = {}): KlondikeState {
  return {
    stock: [], waste: [], foundations: [[], [], [], []], tableau: cols(),
    drawCount: 1, moves: 0, ...patch,
  };
}

const id = (card: Card): string => `${card.rank}${card.suit}`;

describe('newDeck', () => {
  it('holds 52 different cards, all face down', () => {
    const deck = newDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(id)).size).toBe(52);
    expect(deck.every(card => !card.faceUp)).toBe(true);
  });
});

describe('deal', () => {
  it('lays out seven columns of 1 to 7 cards with only the top card face up', () => {
    const s = deal(1, rng(1));
    expect(s.tableau.map(col => col.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const col of s.tableau) {
      expect(col.map(card => card.faceUp)).toEqual(col.map((_, i) => i === col.length - 1));
    }
  });

  it('puts the other 24 cards face down on the stock and uses every card once', () => {
    const s = deal(3, rng(2));
    expect(s.stock).toHaveLength(24);
    expect(s.stock.every(card => !card.faceUp)).toBe(true);
    expect(s.waste).toEqual([]);
    expect(s.foundations).toEqual([[], [], [], []]);
    expect(s.drawCount).toBe(3);
    expect(s.moves).toBe(0);
    expect(new Set([...s.stock, ...s.tableau.flat()].map(id)).size).toBe(52);
  });

  it('is reproducible with the same random source', () => {
    expect(deal(1, rng(7))).toEqual(deal(1, rng(7)));
    expect(deal(1, rng(7))).not.toEqual(deal(1, rng(8)));
  });
});

describe('formatDuration', () => {
  it('formats minutes and seconds, and hours when needed', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(3_723_000)).toBe('1:02:03');
  });
});

describe('draw', () => {
  it('turns one card onto the waste in draw 1', () => {
    const s = draw(state({ stock: cards('_2S', '_3S', '_4S') }));
    expect(s.waste).toEqual(cards('4S'));
    expect(s.stock).toEqual(cards('_2S', '_3S'));
    expect(s.moves).toBe(1);
  });

  it('turns three cards in draw 3, the third one ending on top', () => {
    const s = draw(state({ drawCount: 3, stock: cards('_2S', '_3S', '_4S', '_5S') }));
    expect(s.waste).toEqual(cards('5S', '4S', '3S'));
    expect(s.stock).toEqual(cards('_2S'));
  });

  it('turns what is left when fewer than three cards remain', () => {
    const s = draw(state({ drawCount: 3, stock: cards('_2S', '_3S') }));
    expect(s.waste).toEqual(cards('3S', '2S'));
    expect(s.stock).toEqual([]);
  });

  it('does nothing on an empty stock', () => {
    const s = state({ waste: cards('AS') });
    expect(draw(s)).toBe(s);
  });
});

describe('recycle', () => {
  it('turns the waste back into the stock so the first card comes again first', () => {
    const s = recycle(state({ waste: cards('AS', '2S', '3S'), moves: 4 }));
    expect(s.stock).toEqual(cards('_3S', '_2S', '_AS'));
    expect(s.waste).toEqual([]);
    expect(s.moves).toBe(5);
    expect(draw(s).waste).toEqual(cards('AS'));
  });

  it('does nothing while the stock still has cards or the waste is empty', () => {
    const full = state({ stock: cards('_2S'), waste: cards('AS') });
    expect(recycle(full)).toBe(full);
    const empty = state();
    expect(recycle(empty)).toBe(empty);
  });
});
