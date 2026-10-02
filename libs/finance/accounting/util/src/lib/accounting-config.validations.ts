import { enforce, only, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AccountingConfigModel } from '@okr/shared-models';
import { baseValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

/** Grace days and reminder due days accept whole days from 0 to this many. */
export const REMINDER_DAYS_MAX = 365;

/** Shown under a fee input whose CHF value has more than two decimals (same rule as parseReminderFee). */
export const REMINDER_FEE_DECIMALS_ERROR = '@finance/accounting/feature.validation.reminderFeeDecimals';

/**
 * The model value of a fee typed in CHF: whole Rappen when the input has at most two decimals,
 * otherwise the unrounded CHF × 100 — a fraction the suite rejects, so the error note says why
 * instead of the value being rounded silently.
 */
export function reminderFeeRappen(chf: number): number {
  const rappen = Number(chf) * 100;
  const rounded = Math.round(rappen);
  return Math.abs(rappen - rounded) < 1e-6 ? rounded : rappen;
}

/** The reminder fee of a level in Rappen as the form shows it; legacy configs lack the field (model default). */
export function reminderFeeOf(model: Pick<AccountingConfigModel, 'reminderFees'>, level: number): number {
  const fees = model.reminderFees ?? [0, 2000, 2000];
  return fees[level - 1] ?? 0;
}

export const accountingConfigValidations = staticSuite(
  (model: AccountingConfigModel, tenants: string, tags: string, field?: string) => {
    if (field) only(field);

    baseValidations(model, tenants, tags, field);  // okey, tenants, isArchived
    stringValidations('accountingTenantId', model.accountingTenantId, SHORT_NAME_LENGTH, 1, true);
    // Both account links are optional (empty = not linked yet), but must stay account okeys.
    stringValidations('defaultExpenseAccountKey', model.defaultExpenseAccountKey);
    stringValidations('employeePayablesAccountKey', model.employeePayablesAccountKey);
    // Invoicing (1.76): selector / generated values, so no length cap; empty = not configured yet.
    stringValidations('receivablesAccountKey', model.receivablesAccountKey);
    stringValidations('invoiceTemplateId', model.invoiceTemplateId);
    // Kostenrechnung (1.65): a cost-centre okey, '' = keine Kostenstelle; legacy docs lack the field.
    stringValidations('defaultCostCenterKey', model.defaultCostCenterKey ?? '');
    numberValidations('fiscalYearStart', model.fiscalYearStart, true, 1, 12);
    // Mahnwesen (1.76 phase 3): legacy config docs lack the fields, so validate the model defaults.
    // The template id is a selector-like value (no cap), the fee account a generated okey; '' = not configured.
    stringValidations('reminderTemplateId', model.reminderTemplateId ?? '');
    stringValidations('reminderFeeAccountKey', model.reminderFeeAccountKey ?? '');
    // fees are whole Rappen ≥ 0; a fraction means the CHF input had more than two decimals (reminderFeeRappen)
    numberValidations('reminderFee1', reminderFeeOf(model, 1), false, 0);
    test('reminderFee1', REMINDER_FEE_DECIMALS_ERROR, () => { enforce(Number.isInteger(reminderFeeOf(model, 1))).isTruthy(); });
    numberValidations('reminderFee2', reminderFeeOf(model, 2), false, 0);
    test('reminderFee2', REMINDER_FEE_DECIMALS_ERROR, () => { enforce(Number.isInteger(reminderFeeOf(model, 2))).isTruthy(); });
    numberValidations('reminderFee3', reminderFeeOf(model, 3), false, 0);
    test('reminderFee3', REMINDER_FEE_DECIMALS_ERROR, () => { enforce(Number.isInteger(reminderFeeOf(model, 3))).isTruthy(); });
    numberValidations('reminderGraceDays', model.reminderGraceDays ?? 10, true, 0, REMINDER_DAYS_MAX);
    numberValidations('reminderDueDays', model.reminderDueDays ?? 14, true, 0, REMINDER_DAYS_MAX);
  });
