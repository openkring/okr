import { cardPointsOf, nextTrumpMaker, openRows, sideOfPlayer } from './jass.engine';
import { CARD_POINTS, JassGame, JassHand, JassVariant } from './jass.types';

export interface JassHandFormModel {
  variant: JassVariant;
  /** context, not edited: the side ids in slate order */
  sideIds: string[];
  /** context, not edited: the Coiffeur rows still open for the team; empty for every other variant */
  trumpOptions: string[];
  /** Differenzler is entered in two steps; every other variant in one ('full') */
  phase: 'announce' | 'points' | 'full';
  /** Coiffeur: the row id */
  trump: string;
  /** Schieber/Büter: 1..5 */
  multiplier: number;
  sideId: string;
  points: number[];
  /** Coiffeur only — Schieber and Büter chalk Weis by tapping the slate */
  weis: number[];
  /** '' or a side id */
  match: string;
  announced: number[];
}

export function newHandForm(game: JassGame, phase: JassHandFormModel['phase'], base?: JassHand, excludeIndex?: number): JassHandFormModel {
  const sideIds = game.sides.map(s => s.id);
  const maker = base?.trumpMakerIdx ?? nextTrumpMaker(game);
  const sideId = game.variant === 'coiffeur' ? (base?.sideId ?? sideOfPlayer(game, maker)) : '';
  const trumpOptions = game.variant === 'coiffeur'
    ? openRows(game, sideId, excludeIndex).map(r => r.id)
    : [];
  if (base && game.variant === 'coiffeur' && !trumpOptions.includes(base.trump)) trumpOptions.unshift(base.trump);
  return {
    variant: game.variant,
    sideIds,
    trumpOptions,
    phase,
    trump: base?.trump ?? '',
    multiplier: base?.multiplier ?? 1,
    sideId,
    points: sideIds.map(id => (base && !base.matchSideId ? cardPointsOf(base, id) : 0)),
    weis: sideIds.map(id => base?.weis[id] ?? 0),
    match: base?.matchSideId ?? '',
    announced: sideIds.map(id => base?.announced?.[id] ?? 0),
  };
}

/** With exactly two sides the other side is 157 − x (never below 0). */
export function withCounterPoints(model: JassHandFormModel, changedIdx: number, value: number): JassHandFormModel {
  const points = [...model.points];
  points[changedIdx] = value;
  if (points.length === 2) points[1 - changedIdx] = Math.max(0, CARD_POINTS - value);
  return { ...model, points };
}

export function handFromForm(model: JassHandFormModel, trumpMakerIdx: number): JassHand {
  const byId = (values: number[]) => Object.fromEntries(model.sideIds.map((id, i) => [id, values[i] ?? 0]));
  const hand: JassHand = {
    trumpMakerIdx,
    trump: model.variant === 'coiffeur' ? model.trump : '',
    cardPoints: model.match ? {} : byId(model.points),
    weis: model.variant === 'coiffeur' ? byId(model.weis) : {},
  };
  if (model.variant === 'coiffeur') hand.sideId = model.sideId;
  if (model.variant === 'schieber' || model.variant === 'bueter') hand.multiplier = model.multiplier;
  if (model.match) hand.matchSideId = model.match;
  if (model.variant === 'differenzler') hand.announced = byId(model.announced);
  return hand;
}
