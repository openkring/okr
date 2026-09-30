import { Level } from './chess.ai';
import { ClockState } from './chess.clock';
import { replay } from './chess.game';
import { Color, GameResult, ResultKind } from './chess.types';

export type ChessMode = Level | 'human';
export type ClockMinutes = 0 | 5 | 10 | 15;

export interface ChessSettings {
  mode: ChessMode;
  /** The person's colour against the computer; ignored between two people. */
  human: Color;
  /** Minutes per side, two-person mode only; 0 = no clock. */
  clock: ClockMinutes;
  /** Turn the board after every move (two-person mode). */
  autoFlip: boolean;
}

export const DEFAULT_SETTINGS: ChessSettings = { mode: 'medium', human: 'w', clock: 0, autoFlip: true };

export interface SavedGame {
  v: 1;
  initialFen: string;
  /** UCI moves, oldest first. */
  moves: string[];
  settings: ChessSettings;
  clock: ClockState | null;
  ended: GameResult | null;
}

type Loose = Record<string, unknown>;
const isObject = (x: unknown): x is Loose => typeof x === 'object' && x !== null;

export function isChessSettings(x: unknown): x is ChessSettings {
  return isObject(x)
    && ['easy', 'medium', 'hard', 'human'].includes(x['mode'] as string)
    && (x['human'] === 'w' || x['human'] === 'b')
    && [0, 5, 10, 15].includes(x['clock'] as number)
    && typeof x['autoFlip'] === 'boolean';
}

function parseClock(x: unknown): ClockState | null {
  if (!isObject(x) || !isObject(x['remaining'])) return null;
  const { w, b } = x['remaining'];
  if (typeof w !== 'number' || typeof b !== 'number') return null;
  // A game comes back paused; the time between saving and reopening is never charged.
  return { remaining: { w, b }, running: null, since: null };
}

const VALID_KINDS: readonly ResultKind[] = ['checkmate', 'stalemate', 'repetition', 'fifty-move', 'insufficient', 'timeout', 'resign', 'agreement'];

function parseResult(x: unknown): GameResult | null {
  if (!isObject(x) || typeof x['kind'] !== 'string') return null;
  if (!VALID_KINDS.includes(x['kind'] as ResultKind)) return null;

  const winner = x['winner'];
  if (winner !== 'w' && winner !== 'b' && winner !== null) return null;

  const by = x['by'];
  if (by !== undefined && by !== 'w' && by !== 'b') return null;

  return { kind: x['kind'] as ResultKind, winner: winner as Color | null, ...(by ? { by: by as Color } : {}) };
}

/** A save from `localStorage` checked move by move; null when anything does not fit. */
export function parseSavedGame(raw: unknown): SavedGame | null {
  if (!isObject(raw) || raw['v'] !== 1) return null;
  const { initialFen, moves, settings } = raw;
  if (typeof initialFen !== 'string' || !Array.isArray(moves) || !moves.every(m => typeof m === 'string')) return null;
  if (!isChessSettings(settings)) return null;
  if (!replay(initialFen, moves)) return null;

  const ended = raw['ended'];
  if (ended !== null && ended !== undefined) {
    const parsed = parseResult(ended);
    if (parsed === null) return null;
  }

  return { v: 1, initialFen, moves, settings, clock: parseClock(raw['clock']), ended: parseResult(raw['ended']) };
}
