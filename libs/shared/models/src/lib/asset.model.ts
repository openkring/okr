import { DEFAULT_DATE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { MoneyModel } from '@bk2/shared-models';

import { BkModel, NamedModel } from './base.model';
import { DepreciationMethod } from './asset-category.model';

// Financial fixed asset. Physical description lives in an optionally linked ResourceModel.
// See spec §0.5 for the ResourceModel ↔ AssetModel design decision.
export class AssetModel implements BkModel, NamedModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public name = DEFAULT_NAME;
  public assetNo = '';                              // structured or sequential, e.g. 'HW-2026-001'
  public categoryKey = '';                          // ref to AssetCategoryModel
  public acquisitionDate = DEFAULT_DATE;            // StoreDate yyyymmdd
  public commissioningDate = DEFAULT_DATE;          // StoreDate yyyymmdd
  public acquisitionValue: MoneyModel | undefined;
  public usefulLifeMonths = 0;
  public depreciationMethod: DepreciationMethod = 'linear';
  public balanceAccountKey = '';                    // ref to AccountModel (asset balance sheet account)
  public expenseAccountKey = '';                    // ref to AccountModel (depreciation expense account)
  public billKey = '';                              // ref to BillModel (acquisition invoice)
  public accountingTenantId = '';

  // optional fields
  public vendorKey = '';                            // ref to OrgModel (supplier)
  public serialNo = '';
  public location = '';
  public costCenter = '';
  public responsiblePersonKey = '';                 // ref to PersonModel
  public warrantyEndDate = DEFAULT_DATE;            // StoreDate yyyymmdd

  // ResourceModel ↔ AssetModel bridge: physical catalog entry for this financial asset.
  // ResourceModel holds brand, dimensions, serial; AssetModel holds financial history.
  public resourceKey = '';                          // optional ref to ResourceModel

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
  }
}

export const AssetCollection = 'assets';
export const AssetModelName = 'asset';
