import { describe, expect, it } from 'vitest';

import { AccountingConfigModel } from '@okr/shared-models';

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
  it('turns a legacy config that fails the suite into one that passes', () => {
    expect(accountingConfigValidations(legacyConfig(), 'scs', '').isValid()).toBe(false);
    expect(accountingConfigValidations(toAccountingConfigFormData(legacyConfig()), 'scs', '').isValid()).toBe(true);
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
