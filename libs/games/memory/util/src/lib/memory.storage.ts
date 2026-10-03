import { MEMORY_SIZES, MEMORY_THEMES, MemorySize, MemoryTheme } from './memory.engine';

/*
 * What the page remembers in `localStorage`: the settings, and the best solo result per board
 * size. A game itself is short and is not saved. Everything read back goes through a parser; an
 * entry that does not parse is treated as absent.
 */

export const MEMORY_CONFIG_KEY = 'memory.config';
export const MEMORY_BEST_KEY = 'memory.best';

export type MemoryConfig = { size: MemorySize; theme: MemoryTheme; players: number };

/** Best solo result per size: fewest moves, and the time of that game. */
export type MemoryBest = Partial<Record<MemorySize, { moves: number; ms: number }>>;

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function defaultConfig(): MemoryConfig {
  return { size: 'small', theme: 'animals', players: 1 };
}

/** The settings, each field falling back to its default on its own. */
export function parseConfig(raw: string | null): MemoryConfig {
  const v = parseJson(raw);
  const d = defaultConfig();
  if (!isObject(v)) return d;
  return {
    size: MEMORY_SIZES.includes(v['size'] as MemorySize) ? (v['size'] as MemorySize) : d.size,
    theme: MEMORY_THEMES.includes(v['theme'] as MemoryTheme) ? (v['theme'] as MemoryTheme) : d.theme,
    players: v['players'] === 1 || v['players'] === 2 ? v['players'] : d.players,
  };
}

/** The best results, dropping any size whose entry is malformed. */
export function parseBest(raw: string | null): MemoryBest {
  const v = parseJson(raw);
  if (!isObject(v)) return {};
  const out: MemoryBest = {};
  for (const size of MEMORY_SIZES) {
    const e = v[size];
    if (isObject(e) && isCount(e['moves']) && e['moves'] > 0 && isCount(e['ms'])) {
      out[size] = { moves: e['moves'], ms: e['ms'] };
    }
  }
  return out;
}

/** Whether a finished solo game beats the stored best: fewer moves, or as few and faster. */
export function isNewBest(best: MemoryBest, size: MemorySize, moves: number, ms: number): boolean {
  const prev = best[size];
  return !prev || moves < prev.moves || (moves === prev.moves && ms < prev.ms);
}
