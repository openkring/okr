import { enforce, omitWhen, staticSuite, test } from 'vest';

import { MAX_TOPUP, MIN_TOPUP } from '@okr/business-metering-util';

// Vest messages are i18n keys: okr-error-note resolves any message starting with '@'.
const VPFX = '@finance/collection/feature.validation.';

/** The «Automatisch aufladen» dialog. Both amounts are Rappen, as stored on subscriptions/{tenantId}.autoTopUp. */
export interface AutoTopUpFormModel {
  enabled: boolean;
  threshold: number; // Rappen
  amount: number; // Rappen
}

const isWholeRappen = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

/**
 * Mirrors setAutoTopUp: the threshold is a whole number of Rappen, 0 or more; switched on, the amount is a valid
 * top-up (MIN_TOPUP..MAX_TOPUP); switched off it may stay empty (0), but a set amount must still be valid.
 */
export const autoTopUpValidations = staticSuite((model: AutoTopUpFormModel) => {
  test('threshold', VPFX + 'threshold_negative', () => {
    enforce(isWholeRappen(model.threshold) && model.threshold >= 0).isTruthy();
  });
  omitWhen(!model.enabled && model.amount === 0, () => {
    test('amount', VPFX + 'amount_min', () => {
      enforce(isWholeRappen(model.amount) && model.amount >= MIN_TOPUP).isTruthy();
    });
    test('amount', VPFX + 'amount_max', () => {
      enforce(isWholeRappen(model.amount) && model.amount <= MAX_TOPUP).isTruthy();
    });
  });
});
