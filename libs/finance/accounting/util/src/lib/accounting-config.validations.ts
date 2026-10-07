import { enforce, staticSuite, test } from 'vest';

import { SHORT_NAME_LENGTH } from '@okr/shared-constants';
import { AccountingConfigModel, DEFAULT_REMINDER_DUE_DAYS, DEFAULT_REMINDER_FEES, DEFAULT_REMINDER_GRACE_DAYS } from '@okr/shared-models';
import { baseValidations, numberValidations, stringValidations } from '@okr/shared-util-core';

/** Grace days and reminder due days accept whole days from 0 to this many. */
export const REMINDER_DAYS_MAX = 365;

/** Shown under a fee input whose CHF value has more than two decimals (same rule as parseReminderFee). */
export const REMINDER_FEE_DECIMALS_ERROR = '@finance/accounting/feature.validation.reminderFeeDecimals';

/** Shown under the fee account select when a reminder fee is set but no revenue account takes it (spec 1.76 D14). */
export const REMINDER_FEE_ACCOUNT_REQUIRED_ERROR = '@finance/accounting/feature.validation.reminderFeeAccountRequired';

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
  const fees = model.reminderFees ?? DEFAULT_REMINDER_FEES;
  return fees[level - 1] ?? 0;
}

/** True when any of the three reminder levels charges a fee (> 0 Rappen). */
export function hasReminderFee(model: Pick<AccountingConfigModel, 'reminderFees'>): boolean {
  return [1, 2, 3].some((level) => reminderFeeOf(model, level) > 0);
}

export const accountingConfigValidations = staticSuite(
  (model: AccountingConfigModel, tenants: string, tags: string) => {

    baseValidations(model, tenants, tags);  // okey, tenants, isArchived
    stringValidations('accountingTenantId', model.accountingTenantId, SHORT_NAME_LENGTH, 1, true);
    // Both account links are optional (empty = not linked yet), but must stay account okeys.
    stringValidations('defaultExpenseAccountKey', model.defaultExpenseAccountKey);
    stringValidations('employeePayablesAccountKey', model.employeePayablesAccountKey);
    // Invoicing (1.76): selector / generated values, so no length cap; empty = not configured yet.
    stringValidations('receivablesAccountKey', model.receivablesAccountKey);
    stringValidations('invoiceTemplateId', model.invoiceTemplateId);
    // Rechnungspositionen (1.84): an account okey, '' = the discount reduces the revenue above it; legacy docs lack it.
    stringValidations('discountAccountKey', model.discountAccountKey ?? '');
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
    // a fee is booked to the fee account: without one createInvoiceReminder refuses (no-reminder-fee-account)
    test('reminderFeeAccountKey', REMINDER_FEE_ACCOUNT_REQUIRED_ERROR, () => {
      enforce(!hasReminderFee(model) || !!(model.reminderFeeAccountKey ?? '')).isTruthy();
    });
    numberValidations('reminderGraceDays', model.reminderGraceDays ?? DEFAULT_REMINDER_GRACE_DAYS, true, 0, REMINDER_DAYS_MAX);
    numberValidations('reminderDueDays', model.reminderDueDays ?? DEFAULT_REMINDER_DUE_DAYS, true, 0, REMINDER_DAYS_MAX);
    // journal display labels for bexio's payment words: free text, '' keeps the word; legacy docs lack them
    stringValidations('incomingPaymentLabel', model.incomingPaymentLabel ?? '', SHORT_NAME_LENGTH);
    stringValidations('outgoingPaymentLabel', model.outgoingPaymentLabel ?? '', SHORT_NAME_LENGTH);
  });
