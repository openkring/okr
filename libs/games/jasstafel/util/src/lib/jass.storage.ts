import { normalizeConfig } from './jass.config';
import { CARD_POINTS, JASS_CHALK_UNITS, JASS_VARIANTS, JassChalk, JassGame } from './jass.types';

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/**
 * Trusts a game read back from `localStorage` only if every field the engine and the templates
 * dereference is there. A half-written or hand-edited entry would otherwise throw on every render
 * and lock the page until site data is cleared; returning null starts the page fresh instead.
 */
export function parseStoredGame(raw: unknown): JassGame | null {
  if (!isObject(raw)) return null;
  const g = raw as unknown as JassGame;
  if (typeof g.id !== 'string' || !JASS_VARIANTS.includes(g.variant)) return null;
  if (!Array.isArray(g.players) || !g.players.every(p => isObject(p) && isObject(p.avatar))) return null;
  const n = g.players.length;
  if (!Array.isArray(g.sides) || g.sides.length === 0) return null;
  if (!g.sides.every(s => isObject(s) && typeof s.id === 'string' && Array.isArray(s.playerIdx)
    && s.playerIdx.every(i => isInt(i) && i >= 0 && i < n))) return null;
  if (!Array.isArray(g.hands)) return null;
  if (!g.hands.every(h => isObject(h) && isInt(h.trumpMakerIdx) && typeof h.trump === 'string'
    && isObject(h.cardPoints) && isObject(h.weis))) return null;
  const sideIds = g.sides.map(s => s.id);
  const chalks = (Array.isArray(g.chalks) ? g.chalks : []).filter((c): c is JassChalk => isObject(c)
    && sideIds.includes(c.sideId) && JASS_CHALK_UNITS.includes(c.unit)
    && isInt(c.afterHand) && c.afterHand >= 0 && c.afterHand <= g.hands.length);
  return { ...g, chalks, config: normalizeConfig(g.config) };
}

/** Differenzler announcements entered before a hand; kept only if they fit the running game. */
export function parsePending(raw: unknown, game: JassGame | null): number[] | null {
  if (!game || game.variant !== 'differenzler' || !Array.isArray(raw)) return null;
  if (raw.length !== game.sides.length) return null;
  return raw.every(v => isInt(v) && v >= 0 && v <= CARD_POINTS) ? (raw as number[]) : null;
}
