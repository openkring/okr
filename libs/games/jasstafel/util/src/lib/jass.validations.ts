import { enforce, omitWhen, staticSuite, test } from 'vest';

import { validateBid } from './jass.engine';
import { JassHandFormModel } from './jass-hand.form-model';
import { CARD_POINTS, JASS_MULTIPLIERS, JassConfig } from './jass.types';

const isIntIn = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;

/** Messages are scoped i18n keys; `okr-error-note` resolves them through `I18nService`. */
export const jassHandValidations = staticSuite((model: JassHandFormModel) => {
  omitWhen(model.variant !== 'coiffeur', () => {
    test('trump', '@games/jasstafel/feature.error.trump', () => {
      enforce(model.trumpOptions.includes(model.trump)).isTruthy();
    });
  });

  omitWhen(model.variant !== 'schieber' && model.variant !== 'bueter', () => {
    test('multiplier', '@games/jasstafel/feature.error.multiplier', () => {
      enforce(JASS_MULTIPLIERS.includes(model.multiplier)).isTruthy();
    });
  });

  omitWhen(model.phase === 'announce', () => {
    test('points', '@games/jasstafel/feature.error.points_sum', () => {
      if (model.match) return;
      enforce(model.points.every(p => isIntIn(p, 0, CARD_POINTS))).isTruthy();
      enforce(model.points.reduce((s, p) => s + p, 0)).equals(CARD_POINTS);
    });
  });

  omitWhen(model.variant !== 'coiffeur', () => {
    test('weis', '@games/jasstafel/feature.error.weis', () => {
      enforce(model.weis.every(w => Number.isInteger(w) && w >= 0 && w % 10 === 0)).isTruthy();
    });
  });

  omitWhen(model.variant !== 'coiffeur', () => {
    test('sideId', '@games/jasstafel/feature.error.side', () => {
      enforce(model.sideIds.includes(model.sideId)).isTruthy();
    });
  });

  omitWhen(model.variant !== 'differenzler' || model.phase === 'points', () => {
    test('announced', '@games/jasstafel/feature.error.announce', () => {
      enforce(model.announced.every(a => isIntIn(a, 0, CARD_POINTS))).isTruthy();
    });
  });
});

export const jassConfigValidations = staticSuite((model: JassConfig) => {
  test('schieberTarget', '@games/jasstafel/feature.error.target', () => {
    enforce(isIntIn(model.schieberTarget, 100, 10000)).isTruthy();
  });
  test('bueterPairTarget', '@games/jasstafel/feature.error.target', () => {
    enforce(isIntIn(model.bueterPairTarget, 160, 10000)).isTruthy();
  });
  test('bueterBid', '@games/jasstafel/feature.error.bid', () => {
    enforce(validateBid(model.bueterBid, model)).isTruthy();
  });
  test('differenzlerHands', '@games/jasstafel/feature.error.hands', () => {
    enforce(isIntIn(model.differenzlerHands, 1, 36)).isTruthy();
  });
  test('coiffeurRows', '@games/jasstafel/feature.error.rows', () => {
    enforce(model.coiffeurRows.length).greaterThan(0);
    enforce(model.coiffeurRows.every(r => r.label.trim().length > 0 && isIntIn(r.multiplier, 1, 20))).isTruthy();
  });
});
