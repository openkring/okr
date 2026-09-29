/**
 * Mühle computer opponent: negamax with alpha-beta pruning and move ordering.
 */
import {
  ADJACENT, MILLS, applyMove, legalMoves, opponent, stoneCount,
} from './muehle.engine';
import type { MuehleMove, MuehleState, Player } from './muehle.engine';

export type Difficulty = 'easy' | 'medium' | 'hard';

const DEPTH: Record<Difficulty, number> = { easy: 1, medium: 3, hard: 5 };
const WIN = 100_000;

/** Static evaluation from the perspective of `me`. */
export function evaluate(state: MuehleState, me: Player): number {
  const opp = opponent(me);
  const { board } = state;
  let score = (stoneCount(state, me) - stoneCount(state, opp)) * 100;

  for (const [a, b, c] of MILLS) {
    const line = [board[a], board[b], board[c]];
    const mine = line.filter(x => x === me).length;
    const theirs = line.filter(x => x === opp).length;
    if (mine === 3) score += 12;
    else if (theirs === 3) score -= 12;
    else if (mine === 2 && theirs === 0) score += 8; // open two: mill threat
    else if (theirs === 2 && mine === 0) score -= 8;
  }

  // Mobility matters in the moving phase: count free neighbours.
  for (let p = 0; p < board.length; p++) {
    if (board[p] === null) continue;
    const free = ADJACENT[p].filter(n => board[n] === null).length;
    if (board[p] === me) score += free * 2 - (free === 0 ? 4 : 0);
    else score -= free * 2 - (free === 0 ? 4 : 0);
  }
  return score;
}

function orderMoves(moves: MuehleMove[]): MuehleMove[] {
  // Removals first — they are usually the strongest moves and cause most cutoffs.
  return moves.sort((x, y) => Number(y.remove !== null) - Number(x.remove !== null));
}

function negamax(state: MuehleState, depth: number, alpha: number, beta: number): number {
  const me = state.turn;
  if (state.result) {
    if (state.result.kind === 'draw') return 0;
    // Prefer faster wins / slower losses.
    return state.result.winner === me ? WIN + depth : -WIN - depth;
  }
  if (depth === 0) return evaluate(state, me);

  let best = -Infinity;
  for (const move of orderMoves(legalMoves(state))) {
    const score = -negamax(applyMove(state, move), depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

/** Picks a move for the player to move. `random` is injectable for deterministic tests. */
export function chooseMove(
  state: MuehleState,
  difficulty: Difficulty = 'medium',
  random: () => number = Math.random,
): MuehleMove | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  const depth = DEPTH[difficulty];

  let bestScore = -Infinity;
  let best: MuehleMove[] = [];
  let alpha = -Infinity;
  for (const move of orderMoves(moves)) {
    const score = -negamax(applyMove(state, move), depth - 1, -Infinity, -alpha + 1);
    if (score > bestScore) { bestScore = score; best = [move]; }
    else if (score === bestScore) best.push(move);
    if (score > alpha) alpha = score;
  }
  // Easy mode occasionally plays any legal move.
  if (difficulty === 'easy' && random() < 0.3) return moves[Math.floor(random() * moves.length)];
  return best[Math.floor(random() * best.length)];
}
