import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { CostCenterCollection, CostCenterModel, UserModel } from '@okr/shared-models';
import { getArchiveInclusiveQuery } from '@okr/shared-util-core';

import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class CostCenterService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);

  private readonly i18n = this.i18nService.translateAll({
    create_conf:   PFX + 'create.conf',
    create_error:  PFX + 'create.error',
    update_conf:   PFX + 'update.conf',
    update_error:  PFX + 'update.error',
    archive_conf:  PFX + 'archive.conf',
    archive_error: PFX + 'archive.error',
  });

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
  public async create(costCenter: CostCenterModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<CostCenterModel>(CostCenterCollection, costCenter, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  public async update(costCenter: CostCenterModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<CostCenterModel>(CostCenterCollection, costCenter, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /**
   * Archives instead of deleting: booking lines may reference the cost centre, so the document must
   * stay readable. There is deliberately no delete() (and the Firestore rule forbids it).
   */
  public async archive(costCenter: CostCenterModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<CostCenterModel>(CostCenterCollection, { ...costCenter, isArchived: true }, false, this.i18n.archive_conf(), this.i18n.archive_error(), currentUser);
  }

  /*-------------------------- LIST / QUERY / FILTER --------------------------------*/
  /** All cost centres of an accounting tenant, archived ones included — callers filter. */
  public list(accountingTenantId: string): Observable<CostCenterModel[]> {
    const query = [
      ...getArchiveInclusiveQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    return this.firestoreService.searchData<CostCenterModel>(CostCenterCollection, query, 'id', 'asc');
  }
}
