import { only, staticSuite } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { BOAT_SLOT_NO_COLOR, BoatSlotLabel } from '@okr/shared-models';
import { booleanValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

/**
 * A Bootseinteilung slot label is a free planning note — no key, no tenants, so this suite
 * deliberately skips baseValidations. Both fields are optional; an empty text clears the slot.
 */
export const boatSlotValidations = staticSuite((model: BoatSlotLabel, field?: string) => {
  if (field) only(field);

  stringValidations('text', model.text, SHORT_NAME_LENGTH);
  stringValidations('color', model.color, SHORT_NAME_LENGTH);
  booleanValidations('isStrategyRelevant', model.isStrategyRelevant);
  stringValidations('strategyType', model.strategyType, SHORT_NAME_LENGTH);
  numberValidations('price', model.price, true, 0);
  numberValidations('swisslos', model.swisslos, true, 0, 100);
  numberValidations('donations', model.donations, true, 0);
});

/**
 * A label worth storing carries SOMETHING: a note, a background, or a Bootsstrategie entry.
 * A boat label is typically textless — the boat's name is shown in its place — so emptiness
 * must never be decided on the text alone, or flagging a boat for the strategy is discarded.
 */
export function isEmptyBoatSlot(label: BoatSlotLabel | undefined): boolean {
  if (!label) return true;
  const hasColor = !!label.color && label.color !== BOAT_SLOT_NO_COLOR;
  return !label.text && !hasColor && label.isStrategyRelevant !== true;
}
