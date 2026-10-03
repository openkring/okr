/*
 * Klondike, the pure rules. Every function returns a new state and never changes its input, so
 * the store can keep earlier states as its undo stack. Piles are arrays whose LAST element is the
 * top card.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'];

export type DrawCount = 1 | 3;
export const DRAW_COUNTS: readonly DrawCount[] = [1, 3];

/** rank: 1 = ace … 11 = jack, 12 = queen, 13 = king. */
export type Card = { suit: Suit; rank: number; faceUp: boolean };

export type KlondikeState = {
  /** Face down; the last card is the next one drawn. */
  stock: Card[];
  /** Face up; only the last card is playable. */
  waste: Card[];
  /** Four piles, not tied to a suit until an ace lands on one. */
  foundations: Card[][];
  /** Seven columns. */
  tableau: Card[][];
  drawCount: DrawCount;
  moves: number;
};

/** Where a move picks up cards; `card` is the index of the lowest moved card in its column. */
export type Source =
  | { kind: 'waste' }
  | { kind: 'foundation'; index: number }
  | { kind: 'tableau'; index: number; card: number };

/** Where a move puts cards down. */
export type Target =
  | { kind: 'foundation'; index: number }
  | { kind: 'tableau'; index: number };

export type Move = { from: Source; to: Target };

export const isRed = (suit: Suit): boolean => suit === 'H' || suit === 'D';

export function newDeck(): Card[] {
  return SUITS.flatMap(suit => Array.from({ length: 13 }, (_, i): Card => ({ suit, rank: i + 1, faceUp: false })));
}

/** Fisher–Yates; `rng` returns a number in [0, 1). */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function deal(drawCount: DrawCount, rng: () => number = Math.random): KlondikeState {
  const deck = shuffle(newDeck(), rng);
  const tableau: Card[][] = [];
  let next = 0;
  for (let col = 0; col < 7; col++) {
    const pile = deck.slice(next, next + col + 1);
    next += col + 1;
    pile[pile.length - 1] = { ...pile[pile.length - 1], faceUp: true };
    tableau.push(pile);
  }
  return { stock: deck.slice(next), waste: [], foundations: [[], [], [], []], tableau, drawCount, moves: 0 };
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Turns `drawCount` cards (or what is left) from the stock onto the waste. */
export function draw(state: KlondikeState): KlondikeState {
  if (!state.stock.length) return state;
  const n = Math.min(state.drawCount, state.stock.length);
  const stock = state.stock.slice(0, state.stock.length - n);
  // taken one at a time from the top, so the last one taken ends on top of the waste
  const drawn = state.stock.slice(state.stock.length - n).reverse().map(card => ({ ...card, faceUp: true }));
  return { ...state, stock, waste: [...state.waste, ...drawn], moves: state.moves + 1 };
}

/** With the stock empty: the waste, turned over, becomes the stock again. Unlimited passes. */
export function recycle(state: KlondikeState): KlondikeState {
  if (state.stock.length || !state.waste.length) return state;
  const stock = [...state.waste].reverse().map(card => ({ ...card, faceUp: false }));
  return { ...state, stock, waste: [], moves: state.moves + 1 };
}

/** The cards a move from `from` would pick up; empty when nothing can be picked up there. */
export function movingCards(state: KlondikeState, from: Source): Card[] {
  switch (from.kind) {
    case 'waste':
      return state.waste.slice(-1);
    case 'foundation':
      return (state.foundations[from.index] ?? []).slice(-1);
    case 'tableau': {
      const col = state.tableau[from.index] ?? [];
      return col[from.card]?.faceUp ? col.slice(from.card) : [];
    }
  }
}

function fitsFoundation(pile: readonly Card[], card: Card): boolean {
  const top = pile[pile.length - 1];
  return top ? top.suit === card.suit && card.rank === top.rank + 1 : card.rank === 1;
}

function fitsTableau(pile: readonly Card[], card: Card): boolean {
  const top = pile[pile.length - 1];
  if (!top) return card.rank === 13;
  return top.faceUp && isRed(top.suit) !== isRed(card.suit) && card.rank === top.rank - 1;
}

export function canMove(state: KlondikeState, from: Source, to: Target): boolean {
  const cards = movingCards(state, from);
  if (!cards.length) return false;
  if (to.kind === 'foundation') {
    const pile = state.foundations[to.index];
    if (!pile || from.kind === 'foundation' || cards.length !== 1) return false;
    return fitsFoundation(pile, cards[0]);
  }
  const pile = state.tableau[to.index];
  if (!pile || (from.kind === 'tableau' && from.index === to.index)) return false;
  return fitsTableau(pile, cards[0]);
}

/**
 * Plays the move, or returns `state` itself when it is illegal. A face-down card left on top of
 * the source column turns face up as part of the same move.
 */
export function move(state: KlondikeState, from: Source, to: Target): KlondikeState {
  if (!canMove(state, from, to)) return state;
  const cards = movingCards(state, from);
  const waste = from.kind === 'waste' ? state.waste.slice(0, -1) : state.waste;
  const foundations = [...state.foundations];
  const tableau = [...state.tableau];

  if (from.kind === 'foundation') foundations[from.index] = foundations[from.index].slice(0, -1);
  if (from.kind === 'tableau') {
    const rest = tableau[from.index].slice(0, from.card);
    const top = rest[rest.length - 1];
    if (top && !top.faceUp) rest[rest.length - 1] = { ...top, faceUp: true };
    tableau[from.index] = rest;
  }

  if (to.kind === 'foundation') foundations[to.index] = [...foundations[to.index], ...cards];
  else tableau[to.index] = [...tableau[to.index], ...cards];

  return { ...state, waste, foundations, tableau, moves: state.moves + 1 };
}
