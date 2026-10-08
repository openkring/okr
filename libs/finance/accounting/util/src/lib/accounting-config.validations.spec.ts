import { describe, expect, it } from 'vitest';

import { AccountingConfigModel } from '@okr/shared-models';

import {
  accountingConfigValidations, hasReminderFee, REMINDER_FEE_ACCOUNT_REQUIRED_ERROR, REMINDER_FEE_DECIMALS_ERROR, reminderFeeOf, reminderFeeRappen,
} from './accounting-config.validations';

describe('accountingConfigValidations', () => {
  // the base config links a fee account so fee cases below can set fees > 0 (P3-R2)
  const config = (patch: Partial<AccountingConfigModel> = {}): AccountingConfigModel =>
    Object.assign(new AccountingConfigModel('tenant-1', 'org-1'), { reminderFeeAccountKey: 'org-1-6850' }, patch);

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
      delete legacy.reminderFees;
      delete legacy.reminderGraceDays;
      delete legacy.reminderDueDays;
      expect(accountingConfigValidations(legacy as AccountingConfigModel, 'tenant-1', '').isValid()).toBe(true);
    });

    it('accepts long template ids and fee account keys (uncapped)', () => {
      expect(accountingConfigValidations(config({ reminderTemplateId: 't'.repeat(60), reminderFeeAccountKey: 'a'.repeat(60) }), 'tenant-1', '').isValid()).toBe(true);
    });

    it('rejects a negative or fractional default fee in Rappen', () => {
      const negative = accountingConfigValidations(config({ reminderFee: -100 }), 'tenant-1', '');
      expect(negative.getErrors('reminderFee').length).toBeGreaterThan(0);
      const fractional = accountingConfigValidations(config({ reminderFee: 2050.5 }), 'tenant-1', '');
      expect(fractional.hasErrors('reminderFee')).toBe(true);
      expect(accountingConfigValidations(config({ reminderFee: 2000 }), 'tenant-1', '').getErrors('reminderFee')).toEqual([]);
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
      const result = accountingConfigValidations(config({ reminderFee: reminderFeeRappen(1.234) }), 'tenant-1', '');
      expect(result.getErrors('reminderFee')).toContain(REMINDER_FEE_DECIMALS_ERROR);
      expect(accountingConfigValidations(config({ reminderFee: reminderFeeRappen(0.29) }), 'tenant-1', '').isValid()).toBe(true);
    });

    it('requires the fee account as soon as any level charges a fee (P3-R2)', () => {
      const missing = accountingConfigValidations(config({ reminderFeeAccountKey: '', reminderFee: 2000 }), 'tenant-1', '');
      expect(missing.getErrors('reminderFeeAccountKey')).toContain(REMINDER_FEE_ACCOUNT_REQUIRED_ERROR);
      const legacy = config() as Partial<AccountingConfigModel>;
      delete legacy.reminderFeeAccountKey;
      delete legacy.reminderFees;
      // a legacy config without fees uses the default [0, 0, 0] and needs no fee account
      expect(accountingConfigValidations(legacy as AccountingConfigModel, 'tenant-1', '').getErrors('reminderFeeAccountKey')).toEqual([]);
      expect(accountingConfigValidations(config({ reminderFeeAccountKey: '', reminderFee: 0 }), 'tenant-1', '').isValid()).toBe(true);
      expect(accountingConfigValidations(config({ reminderFeeAccountKey: '', reminderFee: 100 }), 'tenant-1', '').isValid()).toBe(false);
      expect(hasReminderFee({ reminderFee: 0, reminderFees: [0, 0, 0] })).toBe(false);
      expect(hasReminderFee({} as AccountingConfigModel)).toBe(false);
    });

    it('default fee with legacy fallback', () => {
      expect(reminderFeeOf({ reminderFee: 3000, reminderFees: [0, 2500, 4000] })).toBe(3000);
      expect(reminderFeeOf({ reminderFees: [0, 2500, 4000] } as never)).toBe(2500);
      expect(reminderFeeOf({} as AccountingConfigModel)).toBe(0);
      expect(hasReminderFee({ reminderFee: 0, reminderFees: [0, 0, 0] })).toBe(false);
    });
  });
});
