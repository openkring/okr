import { inject, Injectable } from '@angular/core';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { AssetMovementCollection, AssetMovementModel, UserModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { PFX } from './scope';

/** What `postDepreciation` booked (spec 1.103). */
export interface PostDepreciationResult { bookingKey: string; bookingNo: number; total: number; assets: number }

@Injectable({ providedIn: 'root' })
export class AssetMovementService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf: PFX + 'movement.create.conf',
    create_error: PFX + 'movement.create.error',
  });
  private readonly tenantId = this.env.tenantId;

  /**
   * Books one fiscal year's depreciation run through the `postDepreciation` callable (spec 1.103): the
   * server computes the amounts and writes the booking and the asset movements. Rejects with the
   * callable's error (`details.reason`: already-booked, nothing-to-book, asset-accounts-missing, period-locked).
   */
  public async postDepreciation(accountingTenantId: string, year: number): Promise<PostDepreciationResult> {
    const fn = httpsCallable(getFunctions(getApp(), 'europe-west6'), 'postDepreciation');
    return (await fn({ accountingTenantId, year })).data as PostDepreciationResult;
  }

  public async create(movement: AssetMovementModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<AssetMovementModel>(
      AssetMovementCollection, movement,
      this.i18n.create_conf(), this.i18n.create_error(), currentUser
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
