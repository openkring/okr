import { describe, expect, it } from 'vitest';

import { AccountingConfigModel, DEFAULT_REMINDER_FEES } from '@okr/shared-models';

import { accountingConfigValidations } from './accounting-config.validations';
import { toAccountingConfigFormData } from './accounting-config.util';

/** A config doc as Firestore returns it before 1.65/1.76: the newer fields are simply absent. */
function legacyConfig(): AccountingConfigModel {
  return {
    okey: 'scs', tenants: ['scs'], isArchived: false, accountingTenantId: 'scs', accountingBackend: 'native',
    functionalCurrency: 'CHF', defaultExpenseAccountKey: 'scs-6700', employeePayablesAccountKey: 'scs-2000',
    vatRates: [], feeSchedule: [],
  } as unknown as AccountingConfigModel;
}

describe('toAccountingConfigFormData', () => {
  it('a seeded legacy config saves without a fee account; a fee then needs one (P3-R2)', () => {
    const seeded = toAccountingConfigFormData(legacyConfig());
    // the seeded default fees [0, 0, 0] need no fee account
    expect(accountingConfigValidations(seeded, 'scs', '').getErrors('reminderFeeAccountKey')).toEqual([]);
    const withFee = { ...seeded, reminderFees: [0, 2000, 2000] };
    expect(accountingConfigValidations(withFee, 'scs', '').getErrors('reminderFeeAccountKey').length).toBeGreaterThan(0);
    expect(accountingConfigValidations({ ...withFee, reminderFeeAccountKey: 'scs-6850' }, 'scs', '').getErrors('reminderFeeAccountKey')).toEqual([]);
  });

  it('seeds all five reminder fields with the model defaults (P3-R2)', () => {
    const data = toAccountingConfigFormData(legacyConfig());
    expect([data.reminderTemplateId, data.reminderFeeAccountKey, data.reminderFees, data.reminderGraceDays, data.reminderDueDays])
      .toEqual(['', '', [0, 0, 0], 10, 14]);
    expect(data.reminderFees).toEqual([...DEFAULT_REMINDER_FEES]);
    expect(data.reminderFees).not.toBe(DEFAULT_REMINDER_FEES);
  });

  it('keeps the stored reminder fields', () => {
    const stored = { ...legacyConfig(), reminderTemplateId: 'tpl-r', reminderFeeAccountKey: 'scs-6850', reminderFees: [500, 1000, 0],
      reminderGraceDays: 0, reminderDueDays: 30 } as AccountingConfigModel;
    const data = toAccountingConfigFormData(stored);
    expect([data.reminderTemplateId, data.reminderFeeAccountKey, data.reminderFees, data.reminderGraceDays, data.reminderDueDays])
      .toEqual(['tpl-r', 'scs-6850', [500, 1000, 0], 0, 30]);
    data.reminderFees.push(1);
    expect(stored.reminderFees).toEqual([500, 1000, 0]);
  });

  it('fills the missing fields with their model defaults', () => {
    const data = toAccountingConfigFormData(legacyConfig());
    expect(data.receivablesAccountKey).toBe('');
    expect(data.invoiceTemplateId).toBe('');
    expect(data.invoicePaymentAccountKeys).toEqual([]);
    expect(data.defaultCostCenterKey).toBe('');
    expect(data.fiscalYearStart).toBe(1);
  });

  it('keeps every stored value', () => {
    const stored = { ...legacyConfig(), receivablesAccountKey: 'scs-1100', invoiceTemplateId: 'tpl', invoicePaymentAccountKeys: ['scs-1020'],
      defaultCostCenterKey: 'cc-adm', fiscalYearStart: 7 } as AccountingConfigModel;
    const data = toAccountingConfigFormData(stored);
    expect([data.receivablesAccountKey, data.invoiceTemplateId, data.invoicePaymentAccountKeys, data.defaultCostCenterKey, data.fiscalYearStart])
      .toEqual(['scs-1100', 'tpl', ['scs-1020'], 'cc-adm', 7]);
    expect(data.defaultExpenseAccountKey).toBe('scs-6700');
  });

  it('does not share arrays with the stored config', () => {
    const stored = { ...legacyConfig(), invoicePaymentAccountKeys: ['scs-1020'] } as AccountingConfigModel;
    toAccountingConfigFormData(stored).invoicePaymentAccountKeys.push('x');
    expect(stored.invoicePaymentAccountKeys).toEqual(['scs-1020']);
  });
});
