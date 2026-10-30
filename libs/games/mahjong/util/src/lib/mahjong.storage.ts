import { MAHJONG_LAYOUTS, MahjongLayout, MahjongState, isKind, layoutSlots, matches } from './mahjong.engine';

/*
 * The running game, the best time per layout and the settings live in `localStorage`, so a
 * reload or a locked phone resumes the game. Everything read back goes through a parser: an entry
 * that does not parse is treated as absent and a fresh game is dealt, so a hand-edited value can
 * never lock the page. `v` changes whenever the saved shape does.
 */

export const MAHJONG_GAME_KEY = 'mahjong.game';
export const MAHJONG_BEST_KEY = 'mahjong.best';
export const MAHJONG_CONFIG_KEY = 'mahjong.config';
const VERSION = 1;

export type MahjongGame = {
  state: MahjongState;
  /** Playing time so far; the clock does not run while the page is closed. */
  elapsedMs: number;
  won: boolean;
};

/** Best clearing time in ms, per layout. */
export type MahjongBest = Partial<Record<MahjongLayout, number>>;

export type MahjongConfig = {
  /** Darken tiles that cannot be taken yet. */
  dimLocked: boolean;
};

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
export const isLayout = (v: unknown): v is MahjongLayout => MAHJONG_LAYOUTS.includes(v as MahjongLayout);

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Every remaining tile must still have a partner, or the board can never be cleared. */
function pairsUp(kinds: readonly string[], alive: readonly boolean[]): boolean {
  const open: string[] = [];
  kinds.forEach((k, i) => {
    if (!alive[i]) return;
    const j = open.findIndex(o => matches(o, k));
    if (j >= 0) open.splice(j, 1);
    else open.push(k);
  });
  return open.length === 0;
}

function parseState(v: unknown): MahjongState | null {
  if (!isObject(v)) return null;
  const { layout, kinds, alive, moves, shuffles } = v;
  if (!isLayout(layout) || !isCount(moves) || !isCount(shuffles)) return null;
  const n = layoutSlots(layout).length;
  if (!Array.isArray(kinds) || kinds.length !== n || !kinds.every(isKind)) return null;
  if (!Array.isArray(alive) || alive.length !== n || !alive.every(a => typeof a === 'boolean')) return null;
  if (!pairsUp(kinds, alive)) return null;
  return { layout, kinds: kinds.slice(), alive: alive.slice(), moves, shuffles };
}

/** A saved game, or null if any part is missing or inconsistent. */
export function parseGame(raw: string | null): MahjongGame | null {
  const v = parseJson(raw);
  if (!isObject(v) || v['v'] !== VERSION) return null;
  const state = parseState(v['state']);
  const { elapsedMs, won } = v;
  if (!state || !isCount(elapsedMs) || typeof won !== 'boolean') return null;
  return { state, elapsedMs, won };
}

export function serializeGame(game: MahjongGame): string {
  return JSON.stringify({ v: VERSION, ...game });
}

export function parseBest(raw: string | null): MahjongBest {
  const v = parseJson(raw);
  const best: MahjongBest = {};
  if (!isObject(v)) return best;
  for (const layout of MAHJONG_LAYOUTS) {
    const ms = v[layout];
    if (isCount(ms) && ms > 0) best[layout] = ms;
  }
  return best;
}

export function serializeBest(best: MahjongBest): string {
  return JSON.stringify(best);
}

export function isNewBest(best: MahjongBest, layout: MahjongLayout, ms: number): boolean {
  const prev = best[layout];
  return prev === undefined || ms < prev;
}

export function parseConfig(raw: string | null): MahjongConfig {
  const v = parseJson(raw);
  return { dimLocked: isObject(v) && v['dimLocked'] === true };
}
