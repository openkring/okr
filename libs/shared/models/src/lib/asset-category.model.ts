import { DEFAULT_KEY, DEFAULT_NAME, DEFAULT_TENANTS } from '@bk2/shared-constants';

import { BkModel, NamedModel } from './base.model';

export type DepreciationMethod = 'linear' | 'declining' | 'performance' | 'immediate' | 'manual';

export class AssetCategoryModel implements BkModel, NamedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public name = DEFAULT_NAME;                         // e.g. 'Büromaschinen, EDV-Hardware'
  public defaultUsefulLifeMonths = 0;                 // e.g. 36
  public depreciationMethod: DepreciationMethod = 'linear';
  public decliningRate = 0;                           // % for declining-balance, e.g. 40
  public interestRate = 0;                            // % for internal/leasing calculations
  public balanceAccountKey = '';                      // ref to AccountModel (asset balance account)
  public expenseAccountKey = '';                      // ref to AccountModel (depreciation expense account)
  public accountingTenantId = '';

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
  }
}

export const AssetCategoryCollection = 'asset-categories';
export const AssetCategoryModelName = 'assetCategory';
