import { describe, expect, it } from 'vitest';

import { Card, KlondikeState, SUITS, Suit, bestTarget, canAutoFinish, canMove, isWon, nextAutoFinishMove, deal, draw, formatDuration, move, movingCards, newDeck, recycle } from './klondike.engine';

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

describe('movingCards', () => {
  it('takes the top of the waste or a foundation, and a face-up card with everything on it', () => {
    const s = state({
      waste: cards('3D', '9C'),
      foundations: [cards('AS', '2S'), [], [], []],
      tableau: cols(cards('_4C', 'KH', 'QS', 'JD')),
    });
    expect(movingCards(s, { kind: 'waste' })).toEqual(cards('9C'));
    expect(movingCards(s, { kind: 'foundation', index: 0 })).toEqual(cards('2S'));
    expect(movingCards(s, { kind: 'tableau', index: 0, card: 2 })).toEqual(cards('QS', 'JD'));
  });

  it('takes nothing from a face-down card or an empty pile', () => {
    const s = state({ tableau: cols(cards('_4C', 'KH')) });
    expect(movingCards(s, { kind: 'tableau', index: 0, card: 0 })).toEqual([]);
    expect(movingCards(s, { kind: 'tableau', index: 1, card: 0 })).toEqual([]);
    expect(movingCards(s, { kind: 'waste' })).toEqual([]);
  });
});

describe('canMove onto the tableau', () => {
  const t = (index: number) => ({ kind: 'tableau' as const, index });

  it('needs the opposite colour and one rank lower', () => {
    const s = state({ tableau: cols(cards('8S'), cards('7H'), cards('7C'), cards('6H')) });
    expect(canMove(s, { kind: 'tableau', index: 1, card: 0 }, t(0))).toBe(true);
    expect(canMove(s, { kind: 'tableau', index: 2, card: 0 }, t(0))).toBe(false); // same colour
    expect(canMove(s, { kind: 'tableau', index: 3, card: 0 }, t(0))).toBe(false); // two ranks lower
  });

  it('accepts only a king, or a run starting with a king, on an empty column', () => {
    const s = state({ tableau: cols([], cards('_3C', 'KH', 'QS'), cards('QD')) });
    expect(canMove(s, { kind: 'tableau', index: 1, card: 1 }, t(0))).toBe(true);
    expect(canMove(s, { kind: 'tableau', index: 2, card: 0 }, t(0))).toBe(false);
  });

  it('never moves a pile onto itself', () => {
    const s = state({ tableau: cols(cards('8S', '7H')) });
    expect(canMove(s, { kind: 'tableau', index: 0, card: 1 }, t(0))).toBe(false);
  });

  it('takes cards from the waste and back from a foundation', () => {
    const s = state({
      waste: cards('5D'),
      foundations: [cards('AS', '2S'), [], [], []],
      tableau: cols(cards('6S'), cards('3H')),
    });
    expect(canMove(s, { kind: 'waste' }, t(0))).toBe(true);
    expect(canMove(s, { kind: 'foundation', index: 0 }, t(1))).toBe(true);
  });
});

describe('canMove onto a foundation', () => {
  const f = (index: number) => ({ kind: 'foundation' as const, index });

  it('starts with an ace and goes up in the same suit', () => {
    const s = state({
      waste: cards('AH'),
      foundations: [cards('AS'), [], [], []],
      tableau: cols(cards('2S'), cards('2D'), cards('3S', '2H')),
    });
    expect(canMove(s, { kind: 'waste' }, f(1))).toBe(true);
    expect(canMove(s, { kind: 'tableau', index: 0, card: 0 }, f(0))).toBe(true);
    expect(canMove(s, { kind: 'tableau', index: 1, card: 0 }, f(0))).toBe(false); // other suit
    expect(canMove(s, { kind: 'tableau', index: 0, card: 0 }, f(1))).toBe(false); // not an ace
  });

  it('takes a single card only, and never from another foundation', () => {
    const s = state({
      foundations: [cards('AS'), cards('AH'), [], []],
      tableau: cols(cards('3D', '2S')),
    });
    expect(canMove(s, { kind: 'tableau', index: 0, card: 0 }, f(0))).toBe(false); // a run of two
    expect(canMove(s, { kind: 'foundation', index: 0 }, f(2))).toBe(false);
  });
});

describe('move', () => {
  it('moves the run, turns the uncovered card face up and counts one move', () => {
    const s = move(
      state({ tableau: cols([], cards('_3C', 'KH', 'QS')) }),
      { kind: 'tableau', index: 1, card: 1 },
      { kind: 'tableau', index: 0 },
    );
    expect(s.tableau[0]).toEqual(cards('KH', 'QS'));
    expect(s.tableau[1]).toEqual(cards('3C'));
    expect(s.moves).toBe(1);
  });

  it('moves the top of the waste onto a foundation', () => {
    const s = move(state({ waste: cards('9C', 'AH') }), { kind: 'waste' }, { kind: 'foundation', index: 2 });
    expect(s.waste).toEqual(cards('9C'));
    expect(s.foundations[2]).toEqual(cards('AH'));
  });

  it('returns the same state for an illegal move', () => {
    const s = state({ tableau: cols(cards('8S'), cards('7S')) });
    expect(move(s, { kind: 'tableau', index: 1, card: 0 }, { kind: 'tableau', index: 0 })).toBe(s);
  });

  it('never changes the state it was given, so undo can restore it', () => {
    const s = state({ tableau: cols([], cards('_3C', 'KH', 'QS')), waste: cards('AH') });
    const before = JSON.stringify(s);
    move(s, { kind: 'tableau', index: 1, card: 1 }, { kind: 'tableau', index: 0 });
    move(s, { kind: 'waste' }, { kind: 'foundation', index: 0 });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('bestTarget', () => {
  it('prefers a foundation', () => {
    const s = state({ waste: cards('AH'), tableau: cols(cards('2S')) });
    expect(bestTarget(s, { kind: 'waste' })).toEqual({ kind: 'foundation', index: 0 });
  });

  it('prefers a column with cards over an empty one', () => {
    const s = state({ tableau: cols([], cards('KS'), cards('_4C', 'QD')) });
    expect(bestTarget(s, { kind: 'tableau', index: 2, card: 1 })).toEqual({ kind: 'tableau', index: 1 });
  });

  it('moves a king to an empty column', () => {
    const s = state({ tableau: cols([], cards('_4C', 'KH')) });
    expect(bestTarget(s, { kind: 'tableau', index: 1, card: 1 })).toEqual({ kind: 'tableau', index: 0 });
  });

  it('leaves a run that already starts a column where it is', () => {
    const s = state({ tableau: cols([], cards('KH', 'QS')) });
    expect(bestTarget(s, { kind: 'tableau', index: 1, card: 0 })).toBeUndefined();
  });

  it('finds nothing when no move is legal', () => {
    const s = state({ waste: cards('9C'), tableau: cols(cards('KH')) });
    expect(bestTarget(s, { kind: 'waste' })).toBeUndefined();
  });
});

describe('auto-finish and win', () => {
  const allUp = () => state({
    foundations: [cards('AS'), cards('AH'), [], []],
    tableau: cols(cards('3S', '2H'), cards('2S')),
  });

  it('is possible only with stock and waste empty and every card face up', () => {
    expect(canAutoFinish(allUp())).toBe(true);
    expect(canAutoFinish({ ...allUp(), stock: cards('_AD') })).toBe(false);
    expect(canAutoFinish({ ...allUp(), waste: cards('AD') })).toBe(false);
    expect(canAutoFinish(state({ tableau: cols(cards('_3S', '2H')) }))).toBe(false);
  });

  it('plays the lowest top card first', () => {
    expect(nextAutoFinishMove(allUp())).toEqual({
      from: { kind: 'tableau', index: 0, card: 1 },
      to: { kind: 'foundation', index: 1 },
    });
  });

  it('is won with all 52 cards on the foundations', () => {
    const full = SUITS.map(suit => Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 1, faceUp: true })));
    const won = state({ foundations: full });
    expect(isWon(won)).toBe(true);
    expect(canAutoFinish(won)).toBe(false);
    expect(nextAutoFinishMove(won)).toBeUndefined();
    expect(isWon(allUp())).toBe(false);
  });
});
