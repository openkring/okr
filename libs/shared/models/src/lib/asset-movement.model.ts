import { DEFAULT_DATE, DEFAULT_KEY, DEFAULT_NOTES, DEFAULT_TENANTS } from '@bk2/shared-constants';
import { MoneyModel } from '@bk2/shared-models';

import { BkModel } from './base.model';

export type AssetMovementType =
  | 'addition'           // initial capitalisation or component addition
  | 'appreciation'       // write-up to max. acquisition value
  | 'extra_depreciation' // impairment / extraordinary write-down
  | 'partial_disposal'   // disposal of a component
  | 'full_disposal'      // sale or scrapping of the entire asset
  | 'transfer';          // change of cost centre, location, or category

export class AssetMovementModel implements BkModel {
  public bkey = DEFAULT_KEY;
  public tenants: string[] = DEFAULT_TENANTS;
  public isArchived = false;

  public assetKey = '';                               // ref to AssetModel
  public movementType: AssetMovementType = 'addition';
  public date = DEFAULT_DATE;                         // StoreDate yyyymmdd
  public amount: MoneyModel | undefined;
  public reason = DEFAULT_NOTES;
  public bookingKey = '';                             // ref to BookingModel (generated booking)
  public accountingTenantId = '';

  constructor(tenantId: string, accountingTenantId: string) {
    this.tenants = [tenantId];
    this.accountingTenantId = accountingTenantId;
  }
}

export const AssetMovementCollection = 'asset-movements';
export const AssetMovementModelName = 'assetMovement';
