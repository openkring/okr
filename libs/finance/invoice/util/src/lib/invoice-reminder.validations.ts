import { enforce, omitWhen, staticSuite, test } from 'vest';

import { dateValidations } from '@okr/shared-util-core';

import { parseReminderFee, ReminderFormModel } from './invoice-reminder.util';

const VPFX = '@finance/invoice/feature.reminder.validation.';

/** The reminder dialog (spec 1.90 §6.2): a dunning template, a full date, a fee ≥ 0 with at most two decimals; a Mahnlauf needs ≥ 1 invoice. */
export const reminderFormValidations = staticSuite((model: ReminderFormModel, isMahnlauf: boolean) => {
  test('templateId', VPFX + 'templateRequired', () => {
    enforce(model.templateId ?? '').isNotBlank();
  });
  test('date', VPFX + 'dateRequired', () => {
    enforce(/^\d{8}$/.test(model.date ?? '')).isTruthy();
  });
  dateValidations('date', model.date);
  test('feeChf', VPFX + 'feeInvalid', () => {
    enforce(parseReminderFee(String(model.feeChf)) !== undefined).isTruthy();
  });
  omitWhen(!isMahnlauf, () => {
    test('selectedKeys', VPFX + 'selectionRequired', () => {
      enforce((model.selectedKeys ?? []).length > 0).isTruthy();
    });
  });
});
