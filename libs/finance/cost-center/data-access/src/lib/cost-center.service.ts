import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { CostCenterCollection, CostCenterModel, UserModel } from '@okr/shared-models';
import { getArchiveInclusiveQuery } from '@okr/shared-util-core';
import type { MyCostCenterReport } from '@okr/finance-cost-center-util';

import { PFX } from './scope';

export type CostCenterMigrationStep = 'free-text' | 'backfill';
export interface CostCenterMigrationResult {
  scanned: number;
  updated: number;
  /** okey + raw free text of the values that matched no cost centre (no personal data) */
  unmatched: { collection: string; okey: string; value: string }[];
  /** legacy values whose set of books cannot be told: listed, never touched */
  unattributed: { collection: string; okey: string; value: string }[];
  /** backfill lines left alone because their booking lies in a locked period (absent from an older function) */
  lockedSkipped?: number;
  /** backfill lines filled (dry run: to be filled) in a locked period — they get a Kostenstelle since D19 was amended */
  inLockedPeriods?: number;
  /** the fiscal year a backfill processed; missing from a function deployed before spec 1.65 D19 */
  fiscalYear?: number;
}

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

  /** One-off migration (spec 1.65 §6.4) via the treasurer callable; `dryRun` only counts and lists; `fiscalYear` only for the backfill. */
  public async migrate(accountingTenantId: string, step: CostCenterMigrationStep, dryRun: boolean, fiscalYear?: number): Promise<CostCenterMigrationResult> {
    const fn = httpsCallable<{ accountingTenantId: string; step: CostCenterMigrationStep; dryRun: boolean; fiscalYear?: number }, CostCenterMigrationResult>(
      getFunctions(getApp(), 'europe-west6'), 'migrateCostCenters');
    return (await fn(fiscalYear === undefined ? { accountingTenantId, step, dryRun } : { accountingTenantId, step, dryRun, fiscalYear })).data;
  }

  /**
   * «Meine Kostenstellen» (spec 1.65 §7, D21): the Soll-Ist data of the Kostenstellen the caller may see —
   * scoped and masked by the callable; the caller's own books unless `accountingTenantId` is given.
   */
  public async getMyReport(fiscalYear?: number, accountingTenantId?: string): Promise<MyCostCenterReport> {
    const fn = httpsCallable<{ fiscalYear?: number; accountingTenantId?: string }, MyCostCenterReport>(
      getFunctions(getApp(), 'europe-west6'), 'getMyCostCenterReport');
    const data: { fiscalYear?: number; accountingTenantId?: string } = {};
    if (fiscalYear !== undefined) data.fiscalYear = fiscalYear;
    if (accountingTenantId) data.accountingTenantId = accountingTenantId;
    return (await fn(data)).data;
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
