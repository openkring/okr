import { describe, expect, it } from 'vitest';

import { AccountingConfigModel } from '@okr/shared-models';

import { accountingConfigValidations, REMINDER_FEE_DECIMALS_ERROR, reminderFeeOf, reminderFeeRappen } from './accounting-config.validations';

describe('accountingConfigValidations', () => {
  const config = (patch: Partial<AccountingConfigModel> = {}): AccountingConfigModel =>
    Object.assign(new AccountingConfigModel('tenant-1', 'org-1'), patch);

  it('accepts a config with no account links yet', () => {
    expect(accountingConfigValidations(config(), 'tenant-1', '').isValid()).toBe(true);
  });

  it('accepts linked accounts', () => {
    const result = accountingConfigValidations(
      config({ defaultExpenseAccountKey: 'org-1-6700', employeePayablesAccountKey: 'org-1-2000' }), 'tenant-1', '');
    expect(result.isValid()).toBe(true);
  });

  it('accepts the invoicing fields, empty or long (selector fields are uncapped)', () => {
    const result = accountingConfigValidations(
      config({ receivablesAccountKey: 'x'.repeat(30), invoiceTemplateId: 'y'.repeat(40), invoicePaymentAccountKeys: ['a', 'b'] }), 'tenant-1', '');
    expect(result.isValid()).toBe(true);
    expect(accountingConfigValidations(config(), 'tenant-1', '').isValid()).toBe(true);
  });

  it('accepts a fiscal year starting in July', () => {
    expect(accountingConfigValidations(config({ fiscalYearStart: 7 }), 'tenant-1', '').isValid()).toBe(true);
  });

  it('rejects a fiscal year start outside 1..12', () => {
    expect(accountingConfigValidations(config({ fiscalYearStart: 0 }), 'tenant-1', '').getErrors('fiscalYearStart').length).toBeGreaterThan(0);
    expect(accountingConfigValidations(config({ fiscalYearStart: 13 }), 'tenant-1', '').getErrors('fiscalYearStart').length).toBeGreaterThan(0);
  });

  it('accepts the book default Kostenstelle empty, long or missing on a legacy config (selector, uncapped)', () => {
    expect(accountingConfigValidations(config({ defaultCostCenterKey: '' }), 'tenant-1', '').isValid()).toBe(true);
    expect(accountingConfigValidations(config({ defaultCostCenterKey: 'k'.repeat(40) }), 'tenant-1', '').isValid()).toBe(true);
    const legacy = config();
    delete (legacy as Partial<AccountingConfigModel>).defaultCostCenterKey;
    expect(accountingConfigValidations(legacy, 'tenant-1', '').isValid()).toBe(true);
  });

  it('rejects a book default Kostenstelle that is not a key string', () => {
    const result = accountingConfigValidations(config({ defaultCostCenterKey: 42 as unknown as string }), 'tenant-1', '');
    expect(result.getErrors('defaultCostCenterKey').length).toBeGreaterThan(0);
  });

  it('rejects a missing accounting tenant', () => {
    const result = accountingConfigValidations(config({ accountingTenantId: '' }), 'tenant-1', '');
    expect(result.getErrors('accountingTenantId').length).toBeGreaterThan(0);
  });
  describe('reminder settings (1.76 phase 3)', () => {
    it('accepts the model defaults and a legacy config without the reminder fields', () => {
      expect(accountingConfigValidations(config(), 'tenant-1', '').isValid()).toBe(true);
      const legacy = config() as Partial<AccountingConfigModel>;
      delete legacy.reminderTemplateId;
      delete legacy.reminderFeeAccountKey;
      delete legacy.reminderFees;
      delete legacy.reminderGraceDays;
      delete legacy.reminderDueDays;
      expect(accountingConfigValidations(legacy as AccountingConfigModel, 'tenant-1', '').isValid()).toBe(true);
    });

    it('accepts long template ids and fee account keys (uncapped)', () => {
      expect(accountingConfigValidations(config({ reminderTemplateId: 't'.repeat(60), reminderFeeAccountKey: 'a'.repeat(60) }), 'tenant-1', '').isValid()).toBe(true);
    });

    it('rejects a negative or fractional fee in Rappen, per level', () => {
      const negative = accountingConfigValidations(config({ reminderFees: [0, -100, 2000] }), 'tenant-1', '');
      expect(negative.getErrors('reminderFee2').length).toBeGreaterThan(0);
      expect(negative.getErrors('reminderFee1')).toEqual([]);
      const fractional = accountingConfigValidations(config({ reminderFees: [0, 2000, 20.5] }), 'tenant-1', '');
      expect(fractional.getErrors('reminderFee3').length).toBeGreaterThan(0);
    });

    it('accepts grace and due days from 0 to 365 and rejects others', () => {
      expect(accountingConfigValidations(config({ reminderGraceDays: 0, reminderDueDays: 365 }), 'tenant-1', '').isValid()).toBe(true);
      expect(accountingConfigValidations(config({ reminderGraceDays: -1 }), 'tenant-1', '').getErrors('reminderGraceDays').length).toBeGreaterThan(0);
      expect(accountingConfigValidations(config({ reminderDueDays: 366 }), 'tenant-1', '').getErrors('reminderDueDays').length).toBeGreaterThan(0);
      expect(accountingConfigValidations(config({ reminderDueDays: 1.5 }), 'tenant-1', '').getErrors('reminderDueDays').length).toBeGreaterThan(0);
    });

    it('converts a CHF fee with up to two decimals to whole Rappen, keeps more decimals as a rejected fraction', () => {
      expect(reminderFeeRappen(20)).toBe(2000);
      expect(reminderFeeRappen(0.29)).toBe(29);
      expect(reminderFeeRappen(12.5)).toBe(1250);
      expect(Number.isInteger(reminderFeeRappen(1.234))).toBe(false);
      const result = accountingConfigValidations(config({ reminderFees: [0, reminderFeeRappen(1.234), 2000] }), 'tenant-1', '');
      expect(result.getErrors('reminderFee2')).toContain(REMINDER_FEE_DECIMALS_ERROR);
      expect(accountingConfigValidations(config({ reminderFees: [0, reminderFeeRappen(0.29), 2000] }), 'tenant-1', '').isValid()).toBe(true);
    });

    it('reads the fee of a level, the model default when the field is missing', () => {
      expect(reminderFeeOf({ reminderFees: [100, 200, 300] }, 3)).toBe(300);
      expect(reminderFeeOf({ reminderFees: [100] }, 2)).toBe(0);
      expect(reminderFeeOf({} as AccountingConfigModel, 2)).toBe(2000);
    });
  });
});
