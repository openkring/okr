import { Card, DRAW_COUNTS, DrawCount, KlondikeState, SUITS, Suit } from './klondike.engine';

/*
 * The running game and the best time per draw rule live in `localStorage`, so a reload or a
 * locked phone resumes the game. Everything read back goes through a parser: an entry that does
 * not parse is treated as absent and a fresh game is dealt, so a hand-edited value can never lock
 * the page. `v` changes whenever the saved shape does.
 */

export const KLONDIKE_GAME_KEY = 'klondike.game';
export const KLONDIKE_BEST_KEY = 'klondike.best';
const VERSION = 1;

export type KlondikeGame = {
  state: KlondikeState;
  /** Playing time so far; the clock does not run while the page is closed. */
  elapsedMs: number;
  /** The draw rule chosen for the next game. */
  drawNext: DrawCount;
  won: boolean;
};

/** Best winning time in ms, per draw rule. */
export type KlondikeBest = Partial<Record<'1' | '3', number>>;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isDrawCount = (v: unknown): v is DrawCount => DRAW_COUNTS.includes(v as DrawCount);

const isCard = (v: unknown): v is Card =>
  isObject(v) && SUITS.includes(v['suit'] as Suit) && Number.isInteger(v['rank'])
  && (v['rank'] as number) >= 1 && (v['rank'] as number) <= 13 && typeof v['faceUp'] === 'boolean';

const isPile = (v: unknown): v is Card[] => Array.isArray(v) && v.every(isCard);
const arePiles = (v: unknown, count: number): v is Card[][] => Array.isArray(v) && v.length === count && v.every(isPile);

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseState(v: unknown): KlondikeState | null {
  if (!isObject(v)) return null;
  const { stock, waste, foundations, tableau, drawCount, moves } = v;
  if (!isPile(stock) || !isPile(waste) || !arePiles(foundations, 4) || !arePiles(tableau, 7)) return null;
  if (!isDrawCount(drawCount) || !isCount(moves)) return null;
  const all = [...stock, ...waste, ...foundations.flat(), ...tableau.flat()];
  if (all.length !== 52 || new Set(all.map(c => `${c.rank}${c.suit}`)).size !== 52) return null;
  return { stock, waste, foundations, tableau, drawCount, moves };
}

/** A saved game, or null if any part is missing or inconsistent. */
export function parseGame(raw: string | null): KlondikeGame | null {
  const v = parseJson(raw);
  if (!isObject(v) || v['v'] !== VERSION) return null;
  const state = parseState(v['state']);
  const { elapsedMs, drawNext, won } = v;
  if (!state || !isCount(elapsedMs) || !isDrawCount(drawNext) || typeof won !== 'boolean') return null;
  return { state, elapsedMs, drawNext, won };
}

export function serializeGame(game: KlondikeGame): string {
  return JSON.stringify({ v: VERSION, ...game });
}

export function parseBest(raw: string | null): KlondikeBest {
  const v = parseJson(raw);
  const best: KlondikeBest = {};
  if (!isObject(v)) return best;
  for (const key of ['1', '3'] as const) {
    const ms = v[key];
    if (isCount(ms) && ms > 0) best[key] = ms;
  }
  return best;
}

export function serializeBest(best: KlondikeBest): string {
  return JSON.stringify(best);
}

export function isNewBest(best: KlondikeBest, drawCount: DrawCount, ms: number): boolean {
  const prev = best[String(drawCount) as '1' | '3'];
  return prev === undefined || ms < prev;
}
