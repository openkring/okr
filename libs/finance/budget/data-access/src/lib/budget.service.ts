import { inject, Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { deleteDoc, doc } from 'firebase/firestore';
import { Observable } from 'rxjs';

import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { BudgetLineCollection, BudgetLineModel, BudgetVersionCollection, BudgetVersionModel, OkrModel, UserModel } from '@okr/shared-models';
import { generateRandomString, getArchiveInclusiveQuery, removeKeyFromOkrModel } from '@okr/shared-util-core';
import { ApprovalPatch, chunkWrites, copyBudgetLines } from '@okr/finance-budget-util';

import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class BudgetService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly i18nService = inject(I18nService);
  private readonly toastController = inject(ToastController);

  private readonly i18n = this.i18nService.translateAll({
    create_conf:   PFX + 'create.conf',
    create_error:  PFX + 'create.error',
    update_conf:   PFX + 'update.conf',
    update_error:  PFX + 'update.error',
    archive_conf:  PFX + 'archive.conf',
    archive_error: PFX + 'archive.error',
    delete_error:  PFX + 'delete.error',
  });

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- LIST / QUERY --------------------------------*/
  /** All versions of an accounting tenant, archived ones included — callers filter. Newest year first. */
  public listVersions(accountingTenantId: string): Observable<BudgetVersionModel[]> {
    return this.firestoreService.searchData<BudgetVersionModel>(BudgetVersionCollection, this.query(accountingTenantId), 'fiscalYear', 'desc');
  }

  /** The cells of all versions of an accounting tenant, archived ones included — callers filter by `versionKey`. */
  public listLines(accountingTenantId: string): Observable<BudgetLineModel[]> {
    return this.firestoreService.searchData<BudgetLineModel>(BudgetLineCollection, this.query(accountingTenantId), 'versionKey', 'asc');
  }

  private query(accountingTenantId: string) {
    return [
      ...getArchiveInclusiveQuery(this.tenantId),
      { key: 'accountingTenantId', operator: '==' as const, value: accountingTenantId },
    ];
  }

  /*-------------------------- versions --------------------------------*/
  public async createVersion(version: BudgetVersionModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.createModel<BudgetVersionModel>(BudgetVersionCollection, version, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }

  /** Drafts only — the Firestore rule rejects an edit of an approved or superseded version. */
  public async updateVersion(version: BudgetVersionModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<BudgetVersionModel>(BudgetVersionCollection, version, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /** Drafts only (rule). Archived, never deleted: the rule forbids deleting a version. */
  public async archiveVersion(version: BudgetVersionModel, currentUser?: UserModel): Promise<string | undefined> {
    return await this.firestoreService.updateModel<BudgetVersionModel>(BudgetVersionCollection, { ...version, isArchived: true }, false, this.i18n.archive_conf(), this.i18n.archive_error(), currentUser);
  }

  /**
   * A new draft version plus copies of all cells of `base`. The version doc goes into the first batch
   * together with the first chunk of lines (the rule reads the version via getAfter), further lines
   * follow in batches of 400. Without `base` only the empty version is written.
   * @returns the okey of the new version
   */
  public async copyVersion(base: BudgetVersionModel | undefined, next: BudgetVersionModel, baseLines: BudgetLineModel[]): Promise<string> {
    const versionKey = next.okey?.length > 0 ? next.okey : generateRandomString(20);
    const lines = base ? copyBudgetLines(baseLines, base.okey, versionKey) : [];
    const chunks = chunkWrites(lines);
    for (const [index, chunk] of chunks.entries()) {
      const batch = this.firestoreService.getBatch();
      if (index === 0) batch.set(doc(this.firestoreService.firestore, `${BudgetVersionCollection}/${versionKey}`), this.persisted({ ...next, status: 'draft', approvedAt: '', approvedBy: '', approvalRef: '' }));
      for (const line of chunk) {
        const key = generateRandomString(20);
        batch.set(doc(this.firestoreService.firestore, `${BudgetLineCollection}/${key}`), this.persisted(line));
      }
      await batch.commit();
    }
    return versionKey;
  }

  /** Approves the target and supersedes the older approved versions in ONE batch (all or nothing). */
  public async approve(patch: ApprovalPatch): Promise<void> {
    const batch = this.firestoreService.getBatch();
    const { okey, ...approval } = patch.approve;
    batch.update(doc(this.firestoreService.firestore, `${BudgetVersionCollection}/${okey}`), this.clean(approval));
    for (const key of patch.supersede) {
      batch.update(doc(this.firestoreService.firestore, `${BudgetVersionCollection}/${key}`), { status: 'superseded' });
    }
    await batch.commit();
  }

  /*-------------------------- lines (cells) --------------------------------*/
  /** Creates the cell, or updates it when it already has an okey. The currency comes from `line.amount`. */
  public async saveLine(line: BudgetLineModel, currentUser?: UserModel): Promise<string | undefined> {
    if (line.okey?.length > 0) {
      return await this.firestoreService.updateModel<BudgetLineModel>(BudgetLineCollection, line, false, undefined, this.i18n.update_error(), currentUser);
    }
    return await this.firestoreService.createModel<BudgetLineModel>(BudgetLineCollection, line, undefined, this.i18n.create_error(), currentUser);
  }

  /**
   * A cell of a draft is deleted for good, not archived: nothing references a budget line (bookings never
   * point at one), so the deleting-models archive rule does not apply. The Firestore rule only allows it while the
   * version is a draft.
   */
  public async deleteLine(line: BudgetLineModel): Promise<boolean> {
    // not FirestoreService.deleteObject: on failure it toasts an English technical message of its own, and
    // this method already shows the translated one — the user sees exactly one toast.
    if (!line.okey) return false;
    try {
      await deleteDoc(doc(this.firestoreService.firestore, `${BudgetLineCollection}/${line.okey}`));
      return true;
    } catch (ex) {
      console.error(`BudgetService.deleteLine(${line.okey}) -> ERROR: `, ex);
      const toast = await this.toastController.create({ message: this.i18n.delete_error(), duration: 3000 });
      await toast.present();
      return false;
    }
  }

  /*-------------------------- helpers --------------------------------*/
  /** Batch payload: no okey (the doc id carries it), current tenant, plain object without undefined fields. */
  private persisted<T extends OkrModel>(model: T): Record<string, unknown> {
    const stored = removeKeyFromOkrModel(structuredClone(model));
    stored.tenants = [this.tenantId];
    return this.clean(stored);
  }

  private clean<T extends object>(value: T): Record<string, unknown> {
    return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
  }
}
