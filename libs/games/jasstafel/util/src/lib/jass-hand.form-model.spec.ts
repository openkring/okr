import { describe, expect, it } from 'vitest';
import { AvatarInfo } from '@okr/shared-models';
import { DEFAULT_JASS_CONFIG } from './jass.config';
import { addHand, createGame } from './jass.engine';
import { handFromForm, newHandForm, withCounterPoints } from './jass-hand.form-model';

const p = (n: number) => ({ avatar: { key: 'k' + n, name1: '', name2: 'P' + n, label: '', modelType: 'person' } as AvatarInfo });

describe('hand form model', () => {
  const g = createGame('schieber', [p(0), p(1), p(2), p(3)], DEFAULT_JASS_CONFIG, { id: 'g', now: 't' });

  it('starts empty at 1× without a trump choice', () => {
    const m = newHandForm(g, 'full');
    expect(m.sideIds).toEqual(['a', 'b']);
    expect(m.trumpOptions).toEqual([]);
    expect(m.multiplier).toBe(1);
    expect(m.points).toEqual([0, 0]);
  });

  it('derives the other side as 157 − x for two sides, clamped at 0', () => {
    expect(withCounterPoints(newHandForm(g, 'full'), 0, 100).points).toEqual([100, 57]);
    expect(withCounterPoints(newHandForm(g, 'full'), 1, 200).points).toEqual([0, 200]);
  });

  it('round-trips a hand', () => {
    const h = { trumpMakerIdx: 2, trump: '', multiplier: 3, cardPoints: { a: 100, b: 57 }, weis: {} };
    expect(handFromForm(newHandForm(g, 'full', h), 2)).toEqual(h);
  });

  it('keeps the Weis field only for Coiffeur', () => {
    const c = createGame('coiffeur', [p(0), p(1), p(2), p(3)], DEFAULT_JASS_CONFIG, { id: 'c', now: 't' });
    const h = { trumpMakerIdx: 0, trump: 'rosen', sideId: 'a', cardPoints: { a: 100, b: 57 }, weis: { a: 50, b: 0 } };
    expect(handFromForm(newHandForm(c, 'full', h), 0)).toEqual(h);
    const s = { ...newHandForm(g, 'full'), weis: [50, 0] };
    expect(handFromForm(s, 0).weis).toEqual({});
  });

  it('offers Coiffeur only the open rows of the trump-maker team', () => {
    let c = createGame('coiffeur', [p(0), p(1), p(2), p(3)], DEFAULT_JASS_CONFIG, { id: 'c', now: 't' });
    c = addHand(c, { trumpMakerIdx: 0, trump: 'eicheln', sideId: 'a', cardPoints: { a: 100, b: 57 }, weis: {} });
    // next trump-maker is seat 1 (team b): all 10 rows still open for b
    expect(newHandForm(c, 'full').trumpOptions).toHaveLength(10);
    expect(newHandForm(c, 'full').sideId).toBe('b');
  });
});
