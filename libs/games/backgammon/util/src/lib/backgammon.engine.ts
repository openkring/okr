/**
 * Backgammon rules engine — pure and immutable, no Angular.
 *
 * COORDINATES. `points[i]` is point `i + 1` as White counts it. White moves from high indices
 * to low and bears off below 0; Black moves from low to high and bears off above 23. A positive
 * count is White checkers, a negative count Black ones. Each side's OWN point number (the one in
 * the notation) is `i + 1` for White and `24 - i` for Black.
 *
 * A TURN is a roll followed by single-checker steps, one die each. `dice` holds the dice still
 * to play (four for a double); `rolled` the two dice as thrown, for display. The rule of using
 * as many dice as possible — and the higher one if only one fits — is enforced by
 * `legalSteps`, so a player who only ever picks from it always plays a legal turn.
 */

export type Player = 'W' | 'B';

export const BAR = 'bar' as const;
export const OFF = 'off' as const;
export type BgFrom = number | typeof BAR;
export type BgTo = number | typeof OFF;

export type BgStep = { from: BgFrom; to: BgTo; die: number; hit: boolean };

export type BgResultKind = 'single' | 'gammon' | 'backgammon';
export type BgResult = { winner: Player; kind: BgResultKind; points: 1 | 2 | 3 };

export type BgState = {
  points: readonly number[];
  bar: Readonly<Record<Player, number>>;
  off: Readonly<Record<Player, number>>;
  turn: Player;
  /** The two dice as thrown; empty until the side to move has rolled. */
  rolled: readonly number[];
  /** The dice still to play this turn. */
  dice: readonly number[];
  result: BgResult | null;
};

/** One complete turn: the steps in order and the position they lead to. */
export type BgOption = { steps: BgStep[]; final: BgState };

export const CHECKERS = 15;
export const POINTS = 24;

export const opponent = (p: Player): Player => (p === 'W' ? 'B' : 'W');
const sign = (p: Player) => (p === 'W' ? 1 : -1);

/** How many of `p`'s checkers stand on point index `idx`. */
export function countAt(state: Pick<BgState, 'points'>, idx: number, p: Player): number {
  const n = state.points[idx] * sign(p);
  return n > 0 ? n : 0;
}

/** Pips from point index `idx` to `p`'s bear-off — which is also `p`'s own point number. */
export function pointNumber(idx: number, p: Player): number {
  return p === 'W' ? idx + 1 : POINTS - idx;
}

export function startingPoints(): number[] {
  const points = new Array<number>(POINTS).fill(0);
  points[23] = 2; points[12] = 5; points[7] = 3; points[5] = 5;
  points[0] = -2; points[11] = -5; points[16] = -3; points[18] = -5;
  return points;
}

export function rollDie(random: () => number = Math.random): number {
  return 1 + Math.floor(random() * 6);
}

/**
 * A new game after the opening roll: each side throws one die (again on a tie), the higher
 * die moves first and plays both numbers. `rolled` is `[white, black]`.
 */
export function createGame(random: () => number = Math.random): BgState {
  let white: number;
  let black: number;
  do {
    white = rollDie(random);
    black = rollDie(random);
  } while (white === black);
  return {
    points: startingPoints(),
    bar: { W: 0, B: 0 },
    off: { W: 0, B: 0 },
    turn: white > black ? 'W' : 'B',
    rolled: [white, black],
    dice: [white, black],
    result: null,
  };
}

/** The side to move throws `a` and `b`; a double is played four times. */
export function withDice(state: BgState, a: number, b: number): BgState {
  if (state.result || state.rolled.length) throw new Error('backgammon: dice already rolled');
  return { ...state, rolled: [a, b], dice: a === b ? [a, a, a, a] : [a, b] };
}

export function roll(state: BgState, random: () => number = Math.random): BgState {
  return withDice(state, rollDie(random), rollDie(random));
}

export function pipCount(state: BgState, p: Player): number {
  let sum = state.bar[p] * 25;
  for (let i = 0; i < POINTS; i++) sum += countAt(state, i, p) * pointNumber(i, p);
  return sum;
}

/** True while `p` has a checker on the bar or outside the home board (points 7–24). */
function hasFurther(state: BgState, p: Player, pips: number): boolean {
  if (state.bar[p] > 0) return true;
  for (let i = 0; i < POINTS; i++) {
    if (countAt(state, i, p) > 0 && pointNumber(i, p) > pips) return true;
  }
  return false;
}

export function allHome(state: BgState, p: Player): boolean {
  return !hasFurther(state, p, 6);
}

/** Every step the side to move can make with one die, before the use-all-dice rule. */
function stepsForDie(state: BgState, die: number): BgStep[] {
  const p = state.turn;
  const s = sign(p);
  const open = (idx: number) => state.points[idx] * s >= -1;
  const hitAt = (idx: number) => state.points[idx] * s === -1;

  if (state.bar[p] > 0) {
    const to = p === 'W' ? POINTS - die : die - 1;
    return open(to) ? [{ from: BAR, to, die, hit: hitAt(to) }] : [];
  }

  const steps: BgStep[] = [];
  const home = allHome(state, p);
  for (let i = 0; i < POINTS; i++) {
    if (countAt(state, i, p) === 0) continue;
    const to = i - s * die;
    if (to >= 0 && to < POINTS) {
      if (open(to)) steps.push({ from: i, to, die, hit: hitAt(to) });
    } else if (home) {
      // Exact, or a higher die from the rearmost checker.
      const pips = pointNumber(i, p);
      if (die === pips || !hasFurther(state, p, pips)) steps.push({ from: i, to: OFF, die, hit: false });
    }
  }
  return steps;
}

function resultFor(state: BgState, winner: Player): BgResult {
  const loser = opponent(winner);
  if (state.off[loser] > 0) return { winner, kind: 'single', points: 1 };
  let inWinnersHome = state.bar[loser] > 0;
  for (let i = 0; i < POINTS && !inWinnersHome; i++) {
    if (countAt(state, i, loser) > 0 && pointNumber(i, winner) <= 6) inWinnersHome = true;
  }
  return inWinnersHome ? { winner, kind: 'backgammon', points: 3 } : { winner, kind: 'gammon', points: 2 };
}

/** Applies a step without checking it. */
function move(state: BgState, step: BgStep): BgState {
  const p = state.turn;
  const s = sign(p);
  const points = state.points.slice();
  const bar = { ...state.bar };
  const off = { ...state.off };

  if (step.from === BAR) bar[p]--;
  else points[step.from] -= s;

  if (step.to === OFF) {
    off[p]++;
  } else {
    if (points[step.to] === -s) {
      points[step.to] = 0;
      bar[opponent(p)]++;
    }
    points[step.to] += s;
  }

  const used = state.dice.indexOf(step.die);
  const dice = [...state.dice.slice(0, used), ...state.dice.slice(used + 1)];
  const next: BgState = { ...state, points, bar, off, dice };
  return off[p] === CHECKERS ? { ...next, dice: [], result: resultFor(next, p) } : next;
}

function keyOf(state: BgState): string {
  return `${state.points.join(',')}|${state.bar.W},${state.bar.B}|${state.off.W},${state.off.B}|${state.dice.join('')}`;
}

const distinct = (dice: readonly number[]) => [...new Set(dice)];

/**
 * How many dice a step "uses up": one, plus what can still follow — except that bearing off
 * the last checker ends the game and counts as using every die that is left.
 */
function usedBy(state: BgState, step: BgStep, memo: Map<string, number>): number {
  const next = move(state, step);
  return next.result ? state.dice.length : 1 + maxUsable(next, memo);
}

function maxUsable(state: BgState, memo: Map<string, number>): number {
  if (state.result || state.dice.length === 0) return 0;
  const key = keyOf(state);
  const known = memo.get(key);
  if (known !== undefined) return known;
  let best = 0;
  outer: for (const die of distinct(state.dice)) {
    for (const step of stepsForDie(state, die)) {
      best = Math.max(best, usedBy(state, step, memo));
      if (best === state.dice.length) break outer;
    }
  }
  memo.set(key, best);
  return best;
}

/**
 * The steps the side to move may make next: those after which the turn can still use as many
 * dice as the whole roll allows. When only one of two different dice can be played, it must
 * be the higher one if that one fits.
 */
export function legalSteps(state: BgState): BgStep[] {
  if (state.result || state.dice.length === 0) return [];
  const memo = new Map<string, number>();
  const need = maxUsable(state, memo);
  if (need === 0) return [];

  let steps: BgStep[] = [];
  for (const die of distinct(state.dice)) {
    for (const step of stepsForDie(state, die)) {
      if (usedBy(state, step, memo) === need) steps.push(step);
    }
  }
  if (need === 1 && state.dice.length === 2 && state.dice[0] !== state.dice[1]) {
    const high = Math.max(...state.dice);
    if (steps.some(s => s.die === high)) steps = steps.filter(s => s.die === high);
  }
  return steps;
}

const sameStep = (a: BgStep, b: Pick<BgStep, 'from' | 'to' | 'die'>) =>
  a.from === b.from && a.to === b.to && a.die === b.die;

/** Plays one step; throws if it is not one of `legalSteps`. */
export function applyStep(state: BgState, step: Pick<BgStep, 'from' | 'to' | 'die'>): BgState {
  const legal = legalSteps(state).find(s => sameStep(s, step));
  if (!legal) throw new Error(`backgammon: illegal step ${step.from}/${step.to} (${step.die})`);
  return move(state, legal);
}

/** True once the side to move has rolled and has nothing left to play. */
export function canEndTurn(state: BgState): boolean {
  return !state.result && state.rolled.length > 0 && legalSteps(state).length === 0;
}

/** Hands the dice to the other side. */
export function endTurn(state: BgState): BgState {
  if (!canEndTurn(state)) throw new Error('backgammon: the turn is not over');
  return { ...state, turn: opponent(state.turn), rolled: [], dice: [] };
}

/**
 * Every distinct complete turn for the dice rolled, deduplicated by the position it leads to.
 * Empty when nothing can be played. This is what the computer chooses from.
 */
export function turnOptions(state: BgState): BgOption[] {
  if (state.result || state.dice.length === 0) return [];
  const seen = new Set<string>();
  const leaves: { used: number; option: BgOption }[] = [];

  const walk = (s: BgState, steps: BgStep[]) => {
    const key = keyOf(s);
    if (seen.has(key)) return;
    seen.add(key);
    let moved = false;
    if (!s.result) {
      for (const die of distinct(s.dice)) {
        for (const step of stepsForDie(s, die)) {
          moved = true;
          walk(move(s, step), [...steps, step]);
        }
      }
    }
    if (!moved && steps.length) {
      leaves.push({ used: s.result ? state.dice.length : steps.length, option: { steps, final: s } });
    }
  };
  walk(state, []);

  const max = Math.max(0, ...leaves.map(l => l.used));
  let options = leaves.filter(l => l.used === max).map(l => l.option);
  if (max === 1 && state.dice.length === 2 && state.dice[0] !== state.dice[1]) {
    const high = Math.max(...state.dice);
    if (options.some(o => o.steps[0].die === high)) options = options.filter(o => o.steps[0].die === high);
  }

  const byPosition = new Map<string, BgOption>();
  for (const o of options) {
    const key = keyOf({ ...o.final, dice: [] });
    if (!byPosition.has(key)) byPosition.set(key, o);
  }
  return [...byPosition.values()];
}

/** Standard notation in the mover's own point numbers, e.g. `bar/22 13/7*` or `6/off`. */
export function notation(steps: readonly BgStep[], p: Player, labels = { bar: 'bar', off: 'off' }): string {
  return steps
    .map(s => {
      const from = s.from === BAR ? labels.bar : String(pointNumber(s.from, p));
      const to = s.to === OFF ? labels.off : String(pointNumber(s.to, p));
      return `${from}/${to}${s.hit ? '*' : ''}`;
    })
    .join(' ');
}
