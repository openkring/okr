import { describe, expect, it } from 'vitest';
import { AvatarInfo } from '@okr/shared-models';
import { DEFAULT_JASS_CONFIG } from './jass.config';
import { JassHand, JassPlayer } from './jass.types';
import { addHand, createGame, handValues, nextTrumpMaker, replaceHand, totals, undoHand, winner } from './jass.engine';

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

  it('values a hand as (cards + Weis + Stöck) × multiplier', () => {
    const c = { ...g0, config: { ...g0.config, topDownTriple: true } };
    const v = handValues(c, hand({ trump: 'obenabe', cardPoints: { a: 100, b: 57 }, weis: { a: 50 }, stoeckSideId: 'b' }));
    expect(v).toEqual({ a: 450, b: 231 });
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
