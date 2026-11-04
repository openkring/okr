import { enforce, staticSuite, test } from 'vest';

import { EnergySection } from '@okr/shared-models';

import { baseSectionValidations } from './base-section.validations';

/** A comparison shows at most this many municipalities beside the main one (spec 2026-11-04 §6.1). */
export const ENERGY_MAX_COMPARE = 4;

/**
 * No length cap on `locationKey` / `compareKeys` entries: they are foreign keys picked from a select.
 * There is no inheritance from the page, so an empty `locationKey` is unresolved.
 */
export const energySectionValidations = staticSuite((model: EnergySection) => {
  baseSectionValidations(model);

  test('locationKey', 'energyLocationRequired', () => {
    enforce(model.properties?.locationKey).isNotEmpty();
  });

  test('compareKeys', 'energyCompareCount', () => {
    // `?? []`: a document written before the field existed has none
    const keys = model.properties?.compareKeys ?? [];
    enforce(keys.length <= ENERGY_MAX_COMPARE && !keys.includes(model.properties?.locationKey)).isTruthy();
  });
});
