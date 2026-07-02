import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { AssetMovementCollection, AssetMovementModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { PFX } from './scope';

@Injectable({ providedIn: 'root' })
export class AssetMovementService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly tenantId = this.env.tenantId;

  public async create(movement: AssetMovementModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<AssetMovementModel>(
      AssetMovementCollection, movement,
      PFX + 'create.conf', PFX + 'create.error', currentUser
    );
  }

  public listForAsset(assetKey: string, accountingTenantId: string): Observable<AssetMovementModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'assetKey',            operator: '==' as const, value: assetKey },
      { key: 'accountingTenantId',  operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<AssetMovementModel>(AssetMovementCollection, query, 'date', 'asc');
  }

  public list(accountingTenantId: string): Observable<AssetMovementModel[]> {
    const query = [
      ...getSystemQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<AssetMovementModel>(AssetMovementCollection, query, 'date', 'asc');
  }
}
