import { applyMove, inCheck, legalMoves } from './chess.engine';
import { evaluate } from './chess.eval';
import { positionKey } from './chess.fen';
import { Move, PIECE_VALUE, Position, typeOf } from './chess.types';

export type Level = 'easy' | 'medium' | 'hard';

/** Thinking time per level in milliseconds (spec §3.2). */
export const LEVEL_BUDGET_MS: Readonly<Record<Level, number>> = { easy: 300, medium: 1000, hard: 3000 };
const LEVEL_MAX_DEPTH: Readonly<Record<Level, number>> = { easy: 2, medium: 64, hard: 64 };
/** How often `easy` plays a random legal move instead of the searched one. */
const EASY_RANDOM_RATE = 0.25;

const MATE = 100_000;
const MAX_QUIESCENCE_PLY = 24;

export interface SearchOptions {
  level: Level;
  /** Overrides the level's thinking time (the hint uses 1000 ms). */
  budgetMs?: number;
  /** Overrides the level's depth cap (tests). */
  maxDepth?: number;
  /** positionKey() of every earlier position of the game, for the repetition rule. */
  history?: readonly string[];
  random?: () => number;
  now?: () => number;
}

const TIMEOUT = Symbol('timeout');

interface Ctx {
  readonly deadline: number;
  readonly now: () => number;
  nodes: number;
  /** positionKey → occurrences in the game and on the current search path. */
  readonly seen: Map<string, number>;
}

function tick(ctx: Ctx): void {
  if ((++ctx.nodes & 1023) === 0 && ctx.now() >= ctx.deadline) throw TIMEOUT;
}

/** Captures (most valuable victim, least valuable attacker) and promotions first; `first` leads. */
function ordered(moves: readonly Move[], first: Move | null = null): Move[] {
  const score = (m: Move): number => {
    if (m === first) return Infinity;
    let s = 0;
    if (m.captured) s += 10_000 + 10 * PIECE_VALUE[typeOf(m.captured)] - PIECE_VALUE[typeOf(m.piece)];
    if (m.promotion) s += 9_000 + PIECE_VALUE[m.promotion];
    return s;
  };
  return moves.map(m => ({ m, s: score(m) })).sort((a, b) => b.s - a.s).map(x => x.m);
}

/** Only captures and promotions, so a search never stops in the middle of an exchange. */
function quiesce(pos: Position, alpha: number, beta: number, ply: number, ctx: Ctx, moves?: Move[]): number {
  tick(ctx);
  const stand = evaluate(pos);
  if (stand >= beta || ply >= MAX_QUIESCENCE_PLY) return stand;
  if (stand > alpha) alpha = stand;
  for (const m of ordered((moves ?? legalMoves(pos)).filter(x => x.captured || x.promotion))) {
    const score = -quiesce(applyMove(pos, m), -beta, -alpha, ply + 1, ctx);
    if (score >= beta) return score;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(pos: Position, depth: number, alpha: number, beta: number, ply: number, ctx: Ctx): number {
  tick(ctx);
  const key = positionKey(pos);
  // One repetition inside the search already scores as a draw: whoever is worse would repeat.
  if ((ctx.seen.get(key) ?? 0) > 0) return 0;
  const moves = legalMoves(pos);
  // Checkmate/stalemate outrank the fifty-move draw (gameResult puts checkmate first — FIDE).
  if (moves.length === 0) return inCheck(pos) ? -(MATE - ply) : 0;
  if (pos.halfmove >= 100) return 0;
  if (depth <= 0) return quiesce(pos, alpha, beta, ply, ctx, moves);

  ctx.seen.set(key, 1);
  let best = -Infinity;
  for (const m of ordered(moves)) {
    const score = -negamax(applyMove(pos, m), depth - 1, -beta, -alpha, ply + 1, ctx);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  ctx.seen.delete(key);
  return best;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The computer's move: iterative deepening with alpha-beta and quiescence, stopped by the
 * time budget. Every finished depth's best move is kept, so the answer is always legal.
 */
export function chooseMove(pos: Position, opts: SearchOptions): Move | null {
  const moves = legalMoves(pos);
  if (moves.length === 0) return null;
  const random = opts.random ?? Math.random;
  if (opts.level === 'easy' && random() < EASY_RANDOM_RATE) return moves[Math.floor(random() * moves.length)];
  if (moves.length === 1) return moves[0];

  const now = opts.now ?? (() => Date.now());
  const deadline = now() + (opts.budgetMs ?? LEVEL_BUDGET_MS[opts.level]);
  const maxDepth = opts.maxDepth ?? LEVEL_MAX_DEPTH[opts.level];
  // Shuffled first, so that equally good quiet moves vary from game to game (the sort is stable).
  const root = shuffle(moves, random);
  let best = ordered(root)[0];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const seen = new Map<string, number>();
    for (const k of opts.history ?? []) seen.set(k, 1);
    seen.set(positionKey(pos), 1);
    const ctx: Ctx = { deadline, now, nodes: 0, seen };
    try {
      let alpha = -Infinity;
      let bestHere = best;
      for (const m of ordered(root, best)) {
        const score = -negamax(applyMove(pos, m), depth - 1, -Infinity, -alpha, 1, ctx);
        if (score > alpha) {
          alpha = score;
          bestHere = m;
        }
      }
      best = bestHere;
      if (alpha >= MATE - 1000) break; // a forced mate is found; more depth cannot improve it
    } catch (e) {
      if (e === TIMEOUT) break;
      throw e;
    }
    if (now() >= deadline) break;
  }
  return best;
}
