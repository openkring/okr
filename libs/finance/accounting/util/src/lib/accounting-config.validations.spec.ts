import { describe, expect, it } from 'vitest';

import { AccountingConfigModel } from '@okr/shared-models';

import { accountingConfigValidations } from './accounting-config.validations';

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

  it('rejects a missing accounting tenant', () => {
    const result = accountingConfigValidations(config({ accountingTenantId: '' }), 'tenant-1', '');
    expect(result.getErrors('accountingTenantId').length).toBeGreaterThan(0);
  });
});
