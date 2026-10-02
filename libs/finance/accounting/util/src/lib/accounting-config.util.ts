import { AccountingConfigModel, DEFAULT_REMINDER_DUE_DAYS, DEFAULT_REMINDER_FEES, DEFAULT_REMINDER_GRACE_DAYS } from '@okr/shared-models';

/**
 * The editable copy of a stored accounting config. Firestore returns raw documents, so a config
 * written before a field existed (1.65 `defaultCostCenterKey`, 1.76 invoicing) simply lacks it —
 * and `accountingConfigValidations` rejects an undefined string ('notUndefined'), which silently
 * hid the save banner. Every field the suite requires to be defined gets its model default here;
 * stored values are kept. Arrays are copied so editing never mutates the store's object.
 * The five reminder fields (1.76 phase 3) are seeded too, so any save writes them all and settings,
 * reminder dialog, Mahnlauf and server read the same values (ruling P3-R2).
 */
export function toAccountingConfigFormData(config: AccountingConfigModel): AccountingConfigModel {
  return {
    ...config,
    defaultExpenseAccountKey: config.defaultExpenseAccountKey ?? '',
    employeePayablesAccountKey: config.employeePayablesAccountKey ?? '',
    receivablesAccountKey: config.receivablesAccountKey ?? '',
    invoiceTemplateId: config.invoiceTemplateId ?? '',
    invoicePaymentAccountKeys: [...(config.invoicePaymentAccountKeys ?? [])],
    defaultCostCenterKey: config.defaultCostCenterKey ?? '',
    fiscalYearStart: config.fiscalYearStart ?? 1,
    vatRates: structuredClone(config.vatRates ?? []),
    feeSchedule: structuredClone(config.feeSchedule ?? []),
    reminderTemplateId: config.reminderTemplateId ?? '',
    reminderFeeAccountKey: config.reminderFeeAccountKey ?? '',
    reminderFees: [...(config.reminderFees ?? DEFAULT_REMINDER_FEES)],
    reminderGraceDays: config.reminderGraceDays ?? DEFAULT_REMINDER_GRACE_DAYS,
    reminderDueDays: config.reminderDueDays ?? DEFAULT_REMINDER_DUE_DAYS,
  };
}
