import {
  AccountingConfigModel, DEFAULT_INCOMING_PAYMENT_LABEL, DEFAULT_OUTGOING_PAYMENT_LABEL, DEFAULT_REMINDER_DUE_DAYS, DEFAULT_REMINDER_FEES, DEFAULT_REMINDER_GRACE_DAYS,
  INCOMING_PAYMENT_TEXT, OUTGOING_PAYMENT_TEXT,
} from '@okr/shared-models';

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
    discountAccountKey: config.discountAccountKey ?? '',
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
    incomingPaymentLabel: config.incomingPaymentLabel ?? DEFAULT_INCOMING_PAYMENT_LABEL,
    outgoingPaymentLabel: config.outgoingPaymentLabel ?? DEFAULT_OUTGOING_PAYMENT_LABEL,
  };
}

/**
 * A booking text as the journal shows it: bexio's "Zahlungseingang" / "Zahlungsausgang" replaced by
 * the configured labels (case-sensitive, every occurrence). Display only — the stored text stays
 * (GebüV). A legacy config without the fields uses the defaults; an empty label keeps the word.
 */
export function paymentLabelText(text: string, config: Pick<AccountingConfigModel, 'incomingPaymentLabel' | 'outgoingPaymentLabel'> | undefined): string {
  const incoming = config?.incomingPaymentLabel ?? DEFAULT_INCOMING_PAYMENT_LABEL;
  const outgoing = config?.outgoingPaymentLabel ?? DEFAULT_OUTGOING_PAYMENT_LABEL;
  let result = text ?? '';
  if (incoming) result = result.split(INCOMING_PAYMENT_TEXT).join(incoming);
  if (outgoing) result = result.split(OUTGOING_PAYMENT_TEXT).join(outgoing);
  return result;
}
