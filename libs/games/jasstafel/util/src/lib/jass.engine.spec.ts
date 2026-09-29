import { describe, expect, it } from 'vitest';
import { AvatarInfo } from '@okr/shared-models';
import { DEFAULT_JASS_CONFIG } from './jass.config';
import { JassHand, JassPlayer } from './jass.types';
import {
  addHand, createGame, handValues, nextTrumpMaker, openRows, playedRows, replaceHand, stats, totals, undoHand, validateBid, validateHand, winner,
} from './jass.engine';

const p = (n: number): JassPlayer => ({ avatar: { key: 'k' + n, name1: '', name2: 'P' + n, label: '', modelType: 'person' } as AvatarInfo });
const four = [p(0), p(1), p(2), p(3)];
const three = [p(0), p(1), p(2)];
const hand = (h: Partial<JassHand>): JassHand => ({ trumpMakerIdx: 0, trump: 'eicheln', cardPoints: {}, weis: {}, ...h });

describe('Schieber', () => {
  const g0 = createGame('schieber', four, DEFAULT_JASS_CONFIG, { id: 'g', now: 't' });

  it('seats 1+3 against 2+4 with the target on both teams', () => {
    expect(g0.sides).toEqual([
      { id: 'a', playerIdx: [0, 2], target: 1000 },
      { id: 'b', playerIdx: [1, 3], target: 1000 },
    ]);
  });

  it('values a hand as (cards + Weis + Stöck) × the multiplier entered with the points', () => {
    const v = handValues(g0, hand({ multiplier: 3, cardPoints: { a: 100, b: 57 }, weis: { a: 50 }, stoeckSideId: 'b' }));
    expect(v).toEqual({ a: 450, b: 231 });
  });

  it('counts a hand without a multiplier as 1×', () => {
    expect(handValues(g0, hand({ cardPoints: { a: 100, b: 57 } }))).toEqual({ a: 100, b: 57 });
  });

  it('gives a Match 257 and the other side 0', () => {
    const v = handValues(g0, hand({ cardPoints: { a: 10, b: 147 }, matchSideId: 'a' }));
    expect(v).toEqual({ a: 257, b: 0 });
  });

  it('recomputes totals from the hands and rotates the trump-maker', () => {
    let g = addHand(g0, hand({ cardPoints: { a: 100, b: 57 } }));
    g = addHand(g, hand({ trumpMakerIdx: 1, cardPoints: { a: 7, b: 150 } }));
    expect(totals(g)).toEqual({ a: 107, b: 207 });
    expect(nextTrumpMaker(g)).toBe(2);
    expect(totals(undoHand(g))).toEqual({ a: 100, b: 57 });
    expect(totals(replaceHand(g, 0, hand({ cardPoints: { a: 0, b: 157 } })))).toEqual({ a: 7, b: 307 });
  });

  it('declares the first team to reach the target', () => {
    let g = g0;
    for (let i = 0; i < 6; i++) g = addHand(g, hand({ cardPoints: { a: 157, b: 0 } }));
    expect(winner(g)).toBeUndefined();          // 942
    g = addHand(g, hand({ cardPoints: { a: 100, b: 57 } }));
    expect(winner(g)).toBe('a');                 // 1042
  });

  it('decides a same-hand crossing by Stöck before Weis before cards', () => {
    const base = { ...g0, hands: [hand({ cardPoints: { a: 0, b: 0 }, weis: { a: 990, b: 990 } })] };
    // a has 990, b has 990; next hand: b gets Stöck (crosses in stage 1), a gets more cards
    const g = addHand(base, hand({ cardPoints: { a: 150, b: 7 }, stoeckSideId: 'b' }));
    expect(winner(g)).toBe('b');
    // both cross in the Weis stage: the higher running total wins
    const g2 = addHand(base, hand({ cardPoints: { a: 0, b: 157 }, weis: { a: 50, b: 20 } }));
    expect(winner(g2)).toBe('a');
  });

  it('ignores the target once a hand that crossed it is deleted', () => {
    let g = { ...g0, hands: [hand({ cardPoints: { a: 0, b: 0 }, weis: { a: 990 } })] };
    g = addHand(g, hand({ cardPoints: { a: 100, b: 57 } }));
    expect(winner(g)).toBe('a');
    expect(winner(undoHand(g))).toBeUndefined();
  });
});

describe('Büter', () => {
  const g0 = createGame('bueter', three, DEFAULT_JASS_CONFIG, { bid: 500, bueterIdx: 1, id: 'g', now: 't' });

  it('builds the Büter side with the bid and the pair side with the pair target', () => {
    expect(g0.sides).toEqual([
      { id: 'bueter', playerIdx: [1], target: 500 },
      { id: 'pair', playerIdx: [0, 2], target: 1000 },
    ]);
  });

  it('lets the Büter win on reaching the bid while the pair is far from 1000', () => {
    let g = g0;
    for (let i = 0; i < 3; i++) g = addHand(g, hand({ trumpMakerIdx: i % 3, cardPoints: { bueter: 157, pair: 0 } }));
    expect(winner(g)).toBeUndefined();          // 471
    g = addHand(g, hand({ cardPoints: { bueter: 40, pair: 117 } }));
    expect(winner(g)).toBe('bueter');            // 511
  });

  it('rotates the trump-maker over all three players, independent of the Büter', () => {
    const g = addHand(addHand(g0, hand({})), hand({ trumpMakerIdx: 1 }));
    expect(nextTrumpMaker(g)).toBe(2);
  });
});

describe('Coiffeur', () => {
  const rows = [{ id: 'r1', label: 'R1', multiplier: 1 }, { id: 'r2', label: 'R2', multiplier: 2 }];
  const g0 = createGame('coiffeur', four, { ...DEFAULT_JASS_CONFIG, coiffeurRows: rows }, { id: 'g', now: 't' });

  it('scores only the row team, times the row multiplier', () => {
    const g = addHand(g0, hand({ trump: 'r2', sideId: 'b', cardPoints: { a: 57, b: 100 }, weis: { b: 20 } }));
    expect(totals(g)).toEqual({ a: 0, b: 240 });
  });

  it('offers a row again to the other team but not to the team that played it', () => {
    const g = addHand(g0, hand({ trump: 'r1', sideId: 'a', cardPoints: { a: 100, b: 57 } }));
    expect(playedRows(g, 'a')).toEqual(['r1']);
    expect(openRows(g, 'a').map(r => r.id)).toEqual(['r2']);
    expect(openRows(g, 'b').map(r => r.id)).toEqual(['r1', 'r2']);
    expect(validateHand(g, hand({ trump: 'r1', sideId: 'a', cardPoints: { a: 100, b: 57 } }))).toContain('row_played');
    expect(validateHand(g, hand({ trump: 'r1', sideId: 'a', cardPoints: { a: 100, b: 57 } }), 0)).toEqual([]);
  });

  it('ends when every cell is filled, higher sum wins, equal is a draw', () => {
    let g = g0;
    g = addHand(g, hand({ trump: 'r1', sideId: 'a', cardPoints: { a: 100, b: 57 } }));
    g = addHand(g, hand({ trump: 'r2', sideId: 'a', cardPoints: { a: 100, b: 57 } }));
    g = addHand(g, hand({ trump: 'r1', sideId: 'b', cardPoints: { a: 57, b: 100 } }));
    expect(winner(g)).toBeUndefined();
    expect(winner(addHand(g, hand({ trump: 'r2', sideId: 'b', cardPoints: { a: 57, b: 100 } })))).toBe('draw');
    expect(winner(addHand(g, hand({ trump: 'r2', sideId: 'b', cardPoints: { a: 0, b: 157 } })))).toBe('b');
  });

  it('refuses a hand without a team', () => {
    expect(validateHand(g0, hand({ trump: 'r1', cardPoints: { a: 100, b: 57 } }))).toContain('side_missing');
  });
});

describe('Differenzler', () => {
  const g0 = createGame('differenzler', four, { ...DEFAULT_JASS_CONFIG, differenzlerHands: 2 }, { id: 'g', now: 't' });
  const pts = { p0: 50, p1: 40, p2: 37, p3: 30 };

  it('scores |announced − actual| per player', () => {
    const g = addHand(g0, hand({ cardPoints: pts, announced: { p0: 60, p1: 40, p2: 0, p3: 30 } }));
    expect(totals(g)).toEqual({ p0: 10, p1: 0, p2: 37, p3: 0 });
  });

  it('requires the card points to sum to 157', () => {
    expect(validateHand(g0, hand({ cardPoints: { ...pts, p3: 31 }, announced: pts }))).toContain('points_sum');
    expect(validateHand(g0, hand({ cardPoints: pts, announced: pts }))).toEqual([]);
  });

  it('accepts a Match as 257 for one player and 0 for the rest', () => {
    const h = hand({ cardPoints: {}, matchSideId: 'p2', announced: { p0: 0, p1: 0, p2: 157, p3: 0 } });
    expect(validateHand(g0, h)).toEqual([]);
    expect(handValues(g0, h)).toEqual({ p0: 0, p1: 0, p2: 100, p3: 0 });
    expect(validateHand(g0, { ...h, matchSideId: 'p9' })).toContain('match_unknown');
  });

  it('refuses announcements outside 0..157', () => {
    expect(validateHand(g0, hand({ cardPoints: pts, announced: { ...pts, p0: 158 } }))).toContain('announce_range');
  });

  it('ends after the configured number of hands, lowest penalty wins', () => {
    let g = addHand(g0, hand({ cardPoints: pts, announced: { p0: 50, p1: 40, p2: 37, p3: 0 } }));
    expect(winner(g)).toBeUndefined();
    g = addHand(g, hand({ cardPoints: pts, announced: { p0: 50, p1: 40, p2: 30, p3: 30 } }));
    expect(winner(g)).toBe('draw');              // p0 and p1 both 0
  });
});

describe('validateHand (Schieber)', () => {
  const g0 = createGame('schieber', four, DEFAULT_JASS_CONFIG, { id: 'g', now: 't' });
  it('requires 157 in total unless it is a Match', () => {
    expect(validateHand(g0, hand({ cardPoints: { a: 100, b: 50 } }))).toContain('points_sum');
    expect(validateHand(g0, hand({ cardPoints: { a: 100, b: 57 } }))).toEqual([]);
    expect(validateHand(g0, hand({ cardPoints: {}, matchSideId: 'a' }))).toEqual([]);
  });
  it('accepts multipliers 1..5 only, and no longer cares about the trump', () => {
    for (const m of [1, 2, 3, 4, 5]) expect(validateHand(g0, hand({ trump: '', multiplier: m, cardPoints: { a: 100, b: 57 } }))).toEqual([]);
    for (const m of [0, 6, 2.5]) expect(validateHand(g0, hand({ multiplier: m, cardPoints: { a: 100, b: 57 } }))).toContain('multiplier_invalid');
  });
  it('refuses negative and non-multiple-of-10 Weis', () => {
    expect(validateHand(g0, hand({ cardPoints: { a: 100, b: 57 }, weis: { a: -20 } }))).toContain('weis_invalid');
    expect(validateHand(g0, hand({ cardPoints: { a: 100, b: 57 }, weis: { a: 25 } }))).toContain('weis_invalid');
  });
});

describe('validateBid', () => {
  it('accepts 157..pair target in steps of 10', () => {
    expect(validateBid(160, DEFAULT_JASS_CONFIG)).toBe(true);
    expect(validateBid(1000, DEFAULT_JASS_CONFIG)).toBe(true);
    expect(validateBid(150, DEFAULT_JASS_CONFIG)).toBe(false);
    expect(validateBid(505, DEFAULT_JASS_CONFIG)).toBe(false);
    expect(validateBid(1010, DEFAULT_JASS_CONFIG)).toBe(false);
  });
});

describe('stats', () => {
  it('counts raw points, Weis, Stöck and Matches per side, including Coiffeur opponents', () => {
    let g = createGame('schieber', four, DEFAULT_JASS_CONFIG, { id: 'g', now: 't' });
    g = addHand(g, hand({ cardPoints: { a: 100, b: 57 }, weis: { a: 50 }, stoeckSideId: 'b' }));
    g = addHand(g, hand({ cardPoints: {}, matchSideId: 'a' }));
    expect(stats(g)).toEqual({
      a: { hands: 2, pointsPlayed: 357, weis: 50, stoeck: 0, matches: 1, average: 179 },
      b: { hands: 2, pointsPlayed: 57, weis: 0, stoeck: 1, matches: 0, average: 29 },
    });
  });
  it('returns zeros for a game without hands', () => {
    const g = createGame('schieber', four, DEFAULT_JASS_CONFIG, { id: 'g', now: 't' });
    expect(stats(g)['a']).toEqual({ hands: 0, pointsPlayed: 0, weis: 0, stoeck: 0, matches: 0, average: 0 });
  });
});
