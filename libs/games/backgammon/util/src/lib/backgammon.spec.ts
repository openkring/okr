import { describe, expect, it } from 'vitest';

import {
  BAR, BgState, CHECKERS, OFF, Player,
  applyStep, canEndTurn, createGame, endTurn, legalSteps, notation, pipCount, pointNumber, roll,
  startingPoints, turnOptions, withDice,
} from './backgammon.engine';
import { chooseTurn, evaluate } from './backgammon.ai';

/**
 * A position from each side's OWN point numbers, e.g. `{ 6: 2 }` for White = two checkers on
 * White's six point. Checkers not placed are counted as borne off unless `off` says otherwise.
 */
function position(
  white: Record<number, number>,
  black: Record<number, number>,
  opts: Partial<BgState> = {},
): BgState {
  const points = new Array<number>(24).fill(0);
  for (const [n, c] of Object.entries(white)) points[Number(n) - 1] += c;
  for (const [n, c] of Object.entries(black)) points[24 - Number(n)] -= c;
  const bar = opts.bar ?? { W: 0, B: 0 };
  const onBoard = (p: Player, spec: Record<number, number>) =>
    Object.values(spec).reduce((a, b) => a + b, 0) + bar[p];
  return {
    points, bar,
    off: { W: CHECKERS - onBoard('W', white), B: CHECKERS - onBoard('B', black) },
    turn: 'W', rolled: [], dice: [], result: null,
    ...opts,
  };
}

/** Deterministic LCG, so the self-play tests are reproducible. */
function seeded(seed: number): () => number {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

const moves = (s: BgState) => legalSteps(s).map(st => `${st.from}/${st.to}:${st.die}`).sort();

describe('backgammon engine', () => {
  it('starts with 15 checkers a side and 167 pips each', () => {
    const points = startingPoints();
    expect(points.filter(n => n > 0).reduce((a, b) => a + b, 0)).toBe(15);
    expect(points.filter(n => n < 0).reduce((a, b) => a - b, 0)).toBe(15);
    const g = createGame(seeded(1));
    expect(pipCount(g, 'W')).toBe(167);
    expect(pipCount(g, 'B')).toBe(167);
  });

  it('lets the higher opening die move first with both numbers', () => {
    for (let seed = 1; seed < 40; seed++) {
      const g = createGame(seeded(seed));
      const [w, b] = g.rolled;
      expect(w).not.toBe(b);
      expect(g.turn).toBe(w > b ? 'W' : 'B');
      expect(g.dice).toEqual([w, b]);
    }
  });

  it('plays a double four times', () => {
    const g = withDice(position({ 13: 5 }, { 13: 5 }), 3, 3);
    expect(g.dice).toEqual([3, 3, 3, 3]);
    const options = turnOptions(g);
    expect(options.every(o => o.steps.length === 4)).toBe(true);
  });

  it('moves White downwards and Black upwards, never onto a made point', () => {
    const g = withDice(position({ 8: 1 }, { 22: 2 }), 5, 6); // Black's 22 is White's 3
    // 8 → 3 is blocked; 8 → 2 is open
    const steps = legalSteps(g);
    expect(steps.some(s => s.from === 7 && s.to === 2)).toBe(false);
    expect(steps.some(s => s.from === 7 && s.to === 1 && s.die === 6)).toBe(true);
  });

  it('hits a blot and puts it on the bar', () => {
    let g = withDice(position({ 8: 2 }, { 20: 1, 1: 1 }), 3, 1); // Black blot on White's 5
    g = applyStep(g, { from: 7, to: 4, die: 3 });
    expect(g.bar.B).toBe(1);
    expect(g.points[4]).toBe(1);
  });

  it('must enter from the bar before anything else moves', () => {
    const g = withDice(position({ 13: 2 }, { 6: 2 }, { bar: { W: 1, B: 0 } }), 2, 3);
    // enters on Black's home board: White's 23 with a 2, 22 with a 3
    expect(legalSteps(g).every(s => s.from === BAR)).toBe(true);
    expect(moves(g)).toEqual(['bar/21:3', 'bar/22:2']);
  });

  it('cannot move at all when every entry point is closed', () => {
    const closed = { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2 };
    const g = withDice(position({ 13: 2 }, closed, { bar: { W: 1, B: 0 } }), 4, 6);
    expect(legalSteps(g)).toEqual([]);
    expect(canEndTurn(g)).toBe(true);
    expect(endTurn(g).turn).toBe('B');
  });

  it('plays the only die that fits when the other is blocked', () => {
    // Black holds White's 8 and 3: from 9 the 1 is blocked, the 5 reaches 4, then the 1 is blocked again.
    const g = withDice(position({ 9: 1 }, { 17: 2, 22: 2 }), 5, 1);
    expect(moves(g)).toEqual(['8/3:5']);
  });

  it('plays the higher die when either fits alone but not both', () => {
    // Black holds White's 16: 24 → 18 → 16 and 24 → 22 → 16 both end there.
    const g = withDice(position({ 24: 1 }, { 9: 2 }), 6, 2);
    expect(legalSteps(g).map(s => s.die)).toEqual([6]);
  });

  it('bears off with an exact die and with a higher die from the rearmost point only', () => {
    const g = withDice(position({ 4: 1, 2: 1 }, { 24: 1 }), 6, 3);
    const steps = moves(g);
    expect(steps).toContain('3/off:6');
    expect(steps).not.toContain('1/off:6'); // a checker on 4 is still behind
  });

  it('does not bear off while a checker is outside the home board', () => {
    const g = withDice(position({ 7: 1, 3: 1 }, { 24: 1 }), 3, 6);
    expect(legalSteps(g).some(s => s.to === OFF)).toBe(false);
  });

  it('scores single, gammon and backgammon', () => {
    const last = (black: Record<number, number>, extra: Partial<BgState> = {}) => {
      const g = withDice(position({ 1: 1 }, black, extra), 1, 2);
      return applyStep(g, { from: 0, to: OFF, die: 2 }).result;
    };
    expect(last({ 1: 1 }, { off: { W: 14, B: 14 } })).toEqual({ winner: 'W', kind: 'single', points: 1 });
    expect(last({ 13: 15 }, { off: { W: 14, B: 0 } })).toEqual({ winner: 'W', kind: 'gammon', points: 2 });
    expect(last({ 13: 14, 20: 1 }, { off: { W: 14, B: 0 } })).toEqual({ winner: 'W', kind: 'backgammon', points: 3 });
  });

  it('writes notation in the mover’s own point numbers', () => {
    const steps = [
      { from: BAR, to: 21, die: 3, hit: false },
      { from: 12, to: 6, die: 6, hit: true },
      { from: 2, to: OFF, die: 3, hit: false },
    ] as const;
    expect(notation([...steps], 'W')).toBe('bar/22 13/7* 3/off');
    expect(pointNumber(0, 'B')).toBe(24);
  });

  it('dedupes turn options by resulting position and agrees with legalSteps', () => {
    const g = withDice(position({ 6: 5, 8: 3, 13: 5, 24: 2 }, { 6: 5, 8: 3, 13: 5, 24: 2 }), 3, 1);
    const options = turnOptions(g);
    const firsts = new Set(legalSteps(g).map(s => `${s.from}/${s.to}:${s.die}`));
    for (const o of options) {
      expect(o.steps).toHaveLength(2);
      expect(firsts.has(`${o.steps[0].from}/${o.steps[0].to}:${o.steps[0].die}`)).toBe(true);
    }
    // the classic 3-1: making the five point is among them
    expect(options.some(o => o.final.points[4] === 2)).toBe(true);
  });

  it('throws on an illegal step and on rolling twice', () => {
    const g = withDice(position({ 13: 1 }, { 13: 1 }), 2, 1);
    expect(() => applyStep(g, { from: 12, to: 5, die: 2 })).toThrow();
    expect(() => roll(g)).toThrow();
  });
});

describe('backgammon computer', () => {
  it('makes the five point with an opening 3-1', () => {
    const g: BgState = { ...createGame(seeded(3)), turn: 'W', rolled: [], dice: [] };
    const rolled = withDice(g, 3, 1);
    for (const level of ['medium', 'hard'] as const) {
      const steps = chooseTurn(rolled, level, seeded(9));
      const after = steps.reduce(applyStep, rolled);
      expect(after.points[4]).toBe(2);
    }
  });

  it('hits and makes the point when it can (8/5* 6/5)', () => {
    const g = withDice(position({ 6: 5, 8: 3, 13: 5, 24: 2 }, { 6: 5, 8: 3, 13: 5, 24: 1, 20: 1 }), 3, 1);
    const after = chooseTurn(g, 'medium', seeded(1)).reduce(applyStep, g);
    expect(after.points[4]).toBe(2);
    expect(after.bar.B).toBe(1);
  });

  it('never walks into a dead end: random legal steps always use the most dice possible', () => {
    const random = seeded(7);
    let g = createGame(random);
    for (let turn = 0; turn < 300 && !g.result; turn++) {
      if (!g.rolled.length) g = roll(g, random);
      const most = Math.max(0, ...turnOptions(g).map(o => o.steps.length));
      let played = 0;
      for (let steps = legalSteps(g); steps.length; steps = legalSteps(g)) {
        g = applyStep(g, steps[Math.floor(random() * steps.length)]);
        played++;
      }
      if (g.result) break;
      expect(played).toBe(most);
      g = endTurn(g);
    }
  });

  it('finishes self-play games at every level with legal moves only', () => {
    const random = seeded(42);
    for (const [white, black] of [['easy', 'medium'], ['medium', 'hard']] as const) {
      let g = createGame(random);
      let turns = 0;
      while (!g.result && turns < 600) {
        if (!g.rolled.length) g = roll(g, random);
        const steps = chooseTurn(g, g.turn === 'W' ? white : black, random);
        for (const s of steps) g = applyStep(g, s);
        if (!g.result) g = endTurn(g);
        turns++;
      }
      expect(g.result).not.toBeNull();
      const { winner } = g.result!;
      expect(g.off[winner]).toBe(CHECKERS);
    }
  });
});
