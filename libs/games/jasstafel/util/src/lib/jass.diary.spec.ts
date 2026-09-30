import { describe, expect, it } from 'vitest';
import { AvatarInfo } from '@okr/shared-models';
import { DEFAULT_JASS_CONFIG } from './jass.config';
import { jassDiaryDate, jassDiaryLine } from './jass.diary';
import { addHand, createGame } from './jass.engine';
import { JassHand, JassPlayer } from './jass.types';

const p = (name1: string): JassPlayer => ({ avatar: { key: name1, name1, name2: 'X', label: '', modelType: 'person' } as AvatarInfo });
const four = [p('Anna'), p('Beat'), p('Clara'), p('Dora')];
const hand = (h: Partial<JassHand>): JassHand => ({ trumpMakerIdx: 0, trump: 'eicheln', cardPoints: {}, weis: {}, ...h });
const labels = { prefix: 'Jass', variant: 'Schieber', winner: 'Gewonnen', draw: 'Unentschieden', weis: 'Weis', matches: 'Match', hands: 'Runden' };

/** Schieber to 1000: team a (Anna & Clara) wins with 5 hands of 3× (100 + 50 Weis), one of them a Match. */
function finished() {
  let g = createGame('schieber', four, DEFAULT_JASS_CONFIG, { id: 'g', now: '20260930193000' });
  g = addHand(g, hand({ multiplier: 3, cardPoints: { a: 10, b: 147 }, matchSideId: 'a' }));
  for (let i = 0; i < 2; i++) g = addHand(g, hand({ multiplier: 3, cardPoints: { a: 100, b: 57 }, weis: { a: 50 } }));
  return { ...g, finishedAt: '20260930210500' };
}

describe('jassDiaryLine', () => {
  it('is empty while the game runs', () => {
    expect(jassDiaryLine(createGame('schieber', four, DEFAULT_JASS_CONFIG, { id: 'g', now: '20260930193000' }), labels)).toBe('');
  });

  it('names sides by first name with totals, winner, Weis, Match, hands and duration', () => {
    expect(jassDiaryLine(finished(), labels)).toBe(
      'Jass Schieber: Anna & Clara 1671 : Beat & Dora 342 · Gewonnen: Anna & Clara · Weis 100 : 0 · Match 1 : 0 · 3 Runden · 1 h 35 min');
  });

  it('falls back to the last name when the first name is empty', () => {
    const g = finished();
    g.players[0] = { avatar: { ...g.players[0].avatar, name1: '' } };
    expect(jassDiaryLine(g, labels)).toContain('X & Clara');
  });
});

describe('jassDiaryDate', () => {
  it('is the StoreDate of the finish', () => expect(jassDiaryDate(finished())).toBe('20260930'));
  it('is empty while running', () => expect(jassDiaryDate({ ...finished(), finishedAt: undefined })).toBe(''));
});
