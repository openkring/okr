import { enforce, staticSuite, test } from 'vest';

import { DeparturesSection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';

/** What the `getDepartures` callable accepts (spec 1.130 §5.2). */
export const DEPARTURES_MAX_LIMIT = 20;
/** A longer walk than this is no «stop nearby» any more. */
export const DEPARTURES_MAX_WALK = 60;

// no rule on `locationKey`: empty is valid and means the page's location (spec 1.130 §6.4)
export const departuresSectionValidations = staticSuite((model: DeparturesSection) => {
  baseSectionValidations(model);

  test('limit', 'departuresLimitRange', () => {
    const limit = model.properties?.limit;
    enforce(Number.isInteger(limit) && limit >= 1 && limit <= DEPARTURES_MAX_LIMIT).isTruthy();
  });

  test('walkMinutes', 'departuresWalkRange', () => {
    const walk = model.properties?.walkMinutes;
    if (walk === undefined || walk === -1) return;   // -1 (or a legacy doc without it): derived from the distance
    enforce(Number.isInteger(walk) && walk >= 0 && walk <= DEPARTURES_MAX_WALK).isTruthy();
  });
});
