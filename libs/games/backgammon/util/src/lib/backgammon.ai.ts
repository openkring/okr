/**
 * Backgammon computer opponent: a hand-tuned evaluation in pip units, searched one ply
 * (medium) or two plies with the opponent's 21 possible rolls averaged in (hard).
 */
import { BgOption, BgState, BgStep, POINTS, Player, opponent, turnOptions, withDice } from './backgammon.engine';

export type Difficulty = 'easy' | 'medium' | 'hard';

const WIN = 10_000;

/** The 21 distinct rolls with their weight out of 36. */
const ROLLS: { a: number; b: number; weight: number }[] = [];
for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) ROLLS.push({ a, b, weight: a === b ? 1 : 2 });

/** Value of holding a point (2+ checkers), by the owner's point index (0 = the ace point). */
const POINT_VALUE = [1, 2, 3, 4, 5, 5, 4, 2, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 4, 3, 2, 1, 1];
const PRIME_VALUE = [0, 0, 1, 3, 6, 10, 16];

/**
 * The board seen by one side: `own[j]` is that side's checkers on its point `j + 1`,
 * `foe[j]` the opponent's checkers on that same point.
 */
type Side = { own: number[]; foe: number[]; ownBar: number; foeBar: number };

function sideOf(state: BgState, me: Player): Side {
  const s = me === 'W' ? 1 : -1;
  const own = new Array<number>(POINTS).fill(0);
  const foe = new Array<number>(POINTS).fill(0);
  for (let j = 0; j < POINTS; j++) {
    const v = state.points[me === 'W' ? j : POINTS - 1 - j] * s;
    if (v > 0) own[j] = v;
    else foe[j] = -v;
  }
  return { own, foe, ownBar: state.bar[me], foeBar: state.bar[opponent(me)] };
}

const pips = (checkers: number[], bar: number, numberOf: (j: number) => number) =>
  checkers.reduce((sum, n, j) => sum + n * numberOf(j), bar * 25);

/** Points held, primes, stacks — from the owner's view (index 0 = the owner's ace point). */
function structure(own: number[]): number {
  let score = 0;
  let run = 0;
  let longest = 0;
  for (let j = 0; j < POINTS; j++) {
    if (own[j] >= 2) {
      score += POINT_VALUE[j];
      if (j < 18) longest = Math.max(longest, ++run);
    } else {
      run = 0;
    }
    if (own[j] > 3) score -= (own[j] - 3) * 0.7;
  }
  return score + PRIME_VALUE[Math.min(longest, 6)];
}

const madeInHome = (own: number[]) => own.slice(0, 6).filter(n => n >= 2).length;

/** Whether a checker at `k` reaches a blot `d` pips ahead with the roll `a`-`b`. */
function shoots(k: number, d: number, a: number, b: number, blocked: (j: number) => boolean): boolean {
  if (a === b) {
    for (let m = 1; m <= 4; m++) {
      if (a * m === d) return true;
      if (blocked(k + a * m)) return false;
    }
    return false;
  }
  if (d === a || d === b) return true;
  return d === a + b && (!blocked(k + a) || !blocked(k + b));
}

/**
 * What the opponent's next roll is expected to cost `me` in hits: for each of the 36 rolls,
 * the most expensive of my blots it can hit (pips lost plus the risk of not re-entering).
 */
function exposure(side: Side): number {
  const { own, foe, foeBar } = side;
  const blots: number[] = [];
  for (let j = 0; j < POINTS; j++) if (own[j] === 1) blots.push(j);
  if (!blots.length) return 0;

  // The opponent moves toward higher j and enters from j = -1. A checker on its bar must enter
  // first, so then only the bar shoots (a slight overestimate with one checker up).
  const sources: number[] = foeBar > 0 ? [-1] : [];
  if (!foeBar) for (let j = 0; j < POINTS; j++) if (foe[j] > 0) sources.push(j);
  const blocked = (j: number) => j >= 0 && j < POINTS && own[j] >= 2;
  // The opponent's home board is my points 19–24; how many of them it holds decides re-entry.
  const theirBoard = foe.slice(18).filter(n => n >= 2).length;

  let total = 0;
  for (const { a, b, weight } of ROLLS) {
    let worst = 0;
    for (const j of blots) {
      const cost = 24 - j + 4 + 3 * theirBoard;
      if (cost <= worst) continue;
      if (sources.some(k => k < j && shoots(k, j - k, a, b, blocked))) worst = cost;
    }
    total += worst * weight;
  }
  return total / 36;
}

/**
 * The position just after `me` moved, opponent to roll, scored for `me` in pips.
 * Positive is good for `me`.
 */
export function evaluate(state: BgState, me: Player): number {
  if (state.result) return state.result.winner === me ? WIN * state.result.points : -WIN * state.result.points;

  const side = sideOf(state, me);
  const { own, foe, ownBar, foeBar } = side;
  const myPips = pips(own, ownBar, j => j + 1);
  const theirPips = pips(foe, foeBar, j => POINTS - j);
  const off = state.off[me] - state.off[opponent(me)];

  // Contact ends once my rearmost checker has passed the opponent's rearmost.
  const myBack = ownBar ? POINTS : own.reduce((m, n, j) => (n ? j : m), -1);
  const theirBack = foeBar ? -1 : foe.findIndex(n => n > 0);
  const race = theirPips - myPips + off;
  if (theirBack === -1 && !foeBar) return race;
  if (myBack < theirBack) return race;

  const theirs = foe.slice().reverse(); // the opponent's own view
  const barBonus = foeBar * (3 + 2 * madeInHome(own)) - ownBar * (3 + 2 * madeInHome(theirs));
  return race + structure(own) - structure(theirs) + barBonus - exposure(side);
}

function rank(options: BgOption[], me: Player): { option: BgOption; score: number }[] {
  return options
    .map(option => ({ option, score: evaluate(option.final, me) }))
    .sort((x, y) => y.score - x.score);
}

/** After `me` has moved to `position`: the opponent's best answer, averaged over its rolls. */
function lookahead(position: BgState, me: Player): number {
  if (position.result) return evaluate(position, me);
  const opp = opponent(me);
  const handed: BgState = { ...position, turn: opp, rolled: [], dice: [] };
  let total = 0;
  for (const { a, b, weight } of ROLLS) {
    const rolled = withDice(handed, a, b);
    const options = turnOptions(rolled);
    const best = options.length ? rank(options, opp)[0].option.final : rolled;
    total += -evaluate(best, opp) * weight;
  }
  return total / 36;
}

/**
 * The steps the computer plays for the dice it rolled (empty when it cannot move).
 * `random` is injectable for deterministic tests.
 */
export function chooseTurn(
  state: BgState,
  difficulty: Difficulty = 'medium',
  random: () => number = Math.random,
): BgStep[] {
  const options = turnOptions(state);
  if (!options.length) return [];
  const me = state.turn;

  if (difficulty === 'easy' && random() < 0.5) {
    return options[Math.floor(random() * options.length)].steps;
  }
  const ranked = rank(options, me);
  if (difficulty !== 'hard') {
    const top = ranked.filter(r => r.score === ranked[0].score);
    return top[Math.floor(random() * top.length)].option.steps;
  }
  let best = ranked[0];
  let bestScore = -Infinity;
  for (const candidate of ranked.slice(0, 5)) {
    const score = lookahead(candidate.option.final, me);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best.option.steps;
}
