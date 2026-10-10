import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { CostAllocationCollection, CostAllocationModel, UserModel } from '@okr/shared-models';
import { getArchiveInclusiveQuery } from '@okr/shared-util-core';

import { PFX } from './scope';

/** Umlagen (spec 1.65 D24): report-level allocation rules per books and fiscal year. Archived, never deleted. */
@Injectable({
  providedIn: 'root'
})
export class CostAllocationService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18n = inject(I18nService).translateAll({
    create_conf:   PFX + 'allocation.create.conf',
    create_error:  PFX + 'allocation.create.error',
    update_conf:   PFX + 'allocation.update.conf',
    update_error:  PFX + 'allocation.update.error',
    archive_conf:  PFX + 'allocation.archive.conf',
    archive_error: PFX + 'allocation.archive.error',
  });
  private readonly tenantId = this.env.tenantId;

  /** All rules of the books (`accountingTenantId` — NOT the app tenant), archived included — callers filter. */
  public list(accountingTenantId: string): Observable<CostAllocationModel[]> {
    const query = [
      ...getArchiveInclusiveQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
    // no orderBy: equality + array-contains run on merged single-field indexes; an orderBy would need a composite one
    return this.firestoreService.searchData<CostAllocationModel>(CostAllocationCollection, query, 'none');
  }

  public async create(rule: CostAllocationModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<CostAllocationModel>(CostAllocationCollection, rule, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  public async update(rule: CostAllocationModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<CostAllocationModel>(CostAllocationCollection, rule, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  public async archive(rule: CostAllocationModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<CostAllocationModel>(CostAllocationCollection, { ...rule, isArchived: true }, false, this.i18n.archive_conf(), this.i18n.archive_error(), currentUser);
  }
}
