/*
 * Pairs (the classic concentration game), pure. A deck is an array of pair ids, one per card
 * position; two positions holding the same id are a pair. A turn opens two cards: a pair stays
 * open and the same player goes again, a miss is shown and then closed, and the turn passes.
 */

export type MemorySize = 'small' | 'medium' | 'large';
export const MEMORY_SIZES: readonly MemorySize[] = ['small', 'medium', 'large'];

/** Pairs per size and how many columns the board is drawn with. */
export const MEMORY_LAYOUT: Record<MemorySize, { pairs: number; cols: number }> = {
  small: { pairs: 8, cols: 4 },
  medium: { pairs: 12, cols: 4 },
  large: { pairs: 18, cols: 6 },
};

export type MemoryTheme = 'animals' | 'food' | 'sport';
export const MEMORY_THEMES: readonly MemoryTheme[] = ['animals', 'food', 'sport'];

/** The faces of each theme; every theme has enough for the largest board. */
export const MEMORY_SYMBOLS: Record<MemoryTheme, readonly string[]> = {
  animals: ['🐶', '🐱', '🐭', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🦉', '🐢', '🐙', '🦋'],
  food: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🍒', '🍑', '🥝', '🍍', '🥕', '🌽', '🥨', '🧀', '🍕', '🍦', '🍫', '🥐'],
  sport: ['⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🏓', '🏸', '🥊', '⛳', '🎿', '⛸️', '🚴', '🏊', '🛶', '⛵', '🏹', '🥌'],
};

export const MEMORY_MAX_PLAYERS = 2;

/** A random source in [0, 1) — `Math.random` in play, a seeded one in tests. */
export type Rng = () => number;

export type MemoryBoard = {
  /** Pair id per card position. */
  deck: number[];
  /** Positions face up in the current turn: none, one, or the two of a miss waiting to close. */
  open: number[];
  /** Positions of every pair found so far. */
  matched: number[];
  /** Turns taken (two cards each). */
  moves: number;
  /** Pairs found per player. */
  scores: number[];
  /** Whose turn it is (index into `scores`). */
  current: number;
};

export type RevealOutcome = 'ignored' | 'first' | 'match' | 'miss';

export function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A shuffled deck of `pairs` pairs; the pair ids are a random choice out of `symbolCount`. */
export function dealDeck(pairs: number, symbolCount: number, rng: Rng = Math.random): number[] {
  const ids = shuffled(Array.from({ length: symbolCount }, (_, i) => i), rng).slice(0, pairs);
  return shuffled([...ids, ...ids], rng);
}

export function newBoard(size: MemorySize, players: number, symbolCount: number, rng: Rng = Math.random): MemoryBoard {
  const count = Math.min(Math.max(1, players), MEMORY_MAX_PLAYERS);
  return {
    deck: dealDeck(MEMORY_LAYOUT[size].pairs, symbolCount, rng),
    open: [],
    matched: [],
    moves: 0,
    scores: new Array<number>(count).fill(0),
    current: 0,
  };
}

/** True while a miss is shown and has to be closed before the next card can be turned. */
export function missPending(board: MemoryBoard): boolean {
  return board.open.length === 2;
}

/**
 * Turn the card at `i`. Already open or found cards, and any card while a miss is still
 * showing, are ignored — the caller closes the miss first with `closeMiss`.
 */
export function reveal(board: MemoryBoard, i: number): { board: MemoryBoard; outcome: RevealOutcome } {
  if (i < 0 || i >= board.deck.length || missPending(board) || board.open.includes(i) || board.matched.includes(i)) {
    return { board, outcome: 'ignored' };
  }
  if (board.open.length === 0) {
    return { board: { ...board, open: [i] }, outcome: 'first' };
  }
  const first = board.open[0];
  const moves = board.moves + 1;
  if (board.deck[first] === board.deck[i]) {
    const scores = [...board.scores];
    scores[board.current]++;
    return { board: { ...board, open: [], matched: [...board.matched, first, i], moves, scores }, outcome: 'match' };
  }
  return { board: { ...board, open: [first, i], moves }, outcome: 'miss' };
}

/** Turn the two cards of a miss back over and pass the turn. */
export function closeMiss(board: MemoryBoard): MemoryBoard {
  if (!missPending(board)) return board;
  return { ...board, open: [], current: (board.current + 1) % board.scores.length };
}

export function isFinished(board: MemoryBoard): boolean {
  return board.matched.length === board.deck.length;
}

/** The players with the most pairs; more than one means a draw. */
export function leaders(board: MemoryBoard): number[] {
  const best = Math.max(...board.scores);
  return board.scores.flatMap((s, p) => (s === best ? [p] : []));
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
