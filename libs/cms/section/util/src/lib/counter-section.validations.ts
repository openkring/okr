import { enforce, staticSuite, test } from 'vest';

import { COUNTER_UI_TYPES, CounterSection } from '@okr/shared-models';
import { stringValidations } from '@okr/shared-util-core';
import { SHORT_NAME_LENGTH } from '@okr/shared-constants';

import { baseSectionValidations } from './base-section.validations';

/** The caption beside the number; the configuration's `[maxLength]` binds to this very constant. */
export const COUNTER_LABEL_LENGTH = SHORT_NAME_LENGTH;
/** Auto-count step bounds in ms: faster than 100 ms is a blur, slower than an hour is no counter. */
export const COUNTER_MIN_INTERVAL = 100;
export const COUNTER_MAX_INTERVAL = 3_600_000;

// The messages reuse the generic `validation.invalidEnum` / `validation.invalidValue` keys every app
// bundle already has; all three fields are selects, so only a hand-edited document can fail them.
export const counterSectionValidations = staticSuite((model: CounterSection) => {
  baseSectionValidations(model);

  // Prefixed with 'counter.': a plain 'label' could collide with a base section field.
  stringValidations('counter.label', model.properties?.label, COUNTER_LABEL_LENGTH);

  test('counter.uiType', 'invalidEnum', () => {
    enforce((COUNTER_UI_TYPES as readonly string[]).includes(model.properties?.uiType)).isTruthy();
  });

  test('counter.autoInterval', 'invalidValue', () => {
    const interval = model.properties?.autoInterval;
    enforce(Number.isInteger(interval) && interval >= COUNTER_MIN_INTERVAL && interval <= COUNTER_MAX_INTERVAL).isTruthy();
  });

  test('counter.autoDirection', 'invalidEnum', () => {
    enforce(model.properties?.autoDirection === 'up' || model.properties?.autoDirection === 'down').isTruthy();
  });
});
