import { inject, Injectable } from '@angular/core';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { OwnershipCollection, OwnershipModel, UserModel } from '@bk2/shared-models';
import { findByKey, getFullName, getSystemQuery } from '@bk2/shared-util-core';

import { getOwnershipIndex } from '@bk2/relationship-ownership-util';
import { ActivityService } from '@bk2/activity-data-access';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class OwnershipService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
    end_conf:     PFX + 'end.conf',
    end_error:    PFX + 'end.error',
  });
  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations Ownership --------------------------------*/
  /**
   * Create a new ownership and save it to the database.
   * @param ownership the new ownership to save
   * @param currentUser the current user performing the operation
   * @returns the document id of the stored ownership in the database or undefined if the operation failed
   */
  public async create(ownership: OwnershipModel, currentUser?: UserModel): Promise<string | undefined> {
    ownership.index = getOwnershipIndex(ownership);
    const key = await this.firestoreService.createModel<OwnershipModel>(OwnershipCollection, ownership, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    const payload = `${key}: ${getFullName(ownership.ownerName1, ownership.ownerName2)} of ${ownership.resourceName}`;
    void this.activityService.log('ownership', 'create', currentUser, payload);
    return key;
  }

  /**
   * Retrieve an existing ownership from the database.
   * @param key the key of the ownership to retrieve
   * @returns the ownership as an Observable
   */
  public read(key: string): Observable<OwnershipModel | undefined> {
    return findByKey<OwnershipModel>(this.list(), key);
  }

  /**
   * Update an existing ownership with new values.
   * @param ownership the ownership to update
   * @param currentUser the current user performing the operation
   * @return the document id of the updated ownership in the database or undefined if the operation failed
   */
  public async update(ownership: OwnershipModel, currentUser?: UserModel): Promise<string | undefined> {
    ownership.index = getOwnershipIndex(ownership);
    const key = await this.firestoreService.updateModel<OwnershipModel>(OwnershipCollection, ownership, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    const payload = `${key}: ${getFullName(ownership.ownerName1, ownership.ownerName2)} of ${ownership.resourceName}`;
    void this.activityService.log('ownership', 'update', currentUser, payload);
    return key;
  }

  public async delete(ownership: OwnershipModel, currentUser?: UserModel): Promise<void> {
    const payload = `${ownership.bkey}: ${getFullName(ownership.ownerName1, ownership.ownerName2)} of ${ownership.resourceName}`;
    await this.firestoreService.deleteModel<OwnershipModel>(OwnershipCollection, ownership, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('ownership', 'delete', currentUser, payload);
  }

  /**
   * End an existing ownership by setting its validTo date.
   * @param ownership the ownership to end
   * @param validTo the end date of the ownership
   * @param currentUser the current user performing the operation
   * @returns the document id of the updated ownership in the database or undefined if the operation failed
   */
  public async endOwnershipByDate(ownership: OwnershipModel, validTo: string, currentUser?: UserModel): Promise<string | undefined> {
    if (ownership.validTo.startsWith('9999') && validTo && validTo.length === 8) {
      ownership.validTo = validTo;
      return await this.firestoreService.updateModel<OwnershipModel>(OwnershipCollection, ownership, false, this.i18n.end_conf(), this.i18n.end_error(), currentUser);
    }
    return undefined;
  }

  /*-------------------------- LIST / QUERY  --------------------------------*/
  public list(orderBy = 'validFrom', sortOrder = 'desc'): Observable<OwnershipModel[]> {
    return this.firestoreService.searchData<OwnershipModel>(OwnershipCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
  }

  /**
   * List the ownerships for a given owner (person or organization).
   * @param ownerKey the given subject to list its ownerships for.
   * @returns a list of the owner's ownerships as an Observable
   */
  public listOwnershipsOfOwner(ownerKey: string, modelType: 'person' | 'org'): Observable<OwnershipModel[]> {
    if (!ownerKey || ownerKey.length === 0) return of([]);

    return this.list().pipe(
      map((ownerships: OwnershipModel[]) => {
        return ownerships.filter((ownership: OwnershipModel) => ownership.ownerKey === ownerKey && ownership.ownerModelType === modelType);
      }));
  }

  /*-------------------------- export --------------------------------*/
  public async export(): Promise<void> {
    //const index = await this.selectExportType();
    //if (index === undefined) return;
    //if (index === 0) {
    console.log('OwnershipService.export: export are not implemented yet.');
    //await exportXlsx(this.filteredItems(), 'all', 'all');
    //}
  }

  /*  private async selectExportType(): Promise<number | undefined> {
     const modal = await this.modalController.create({
       component: BkLabelSelectModal,
       componentProps: {
         labels: [
           '@ownership.select.raw', 
           '@ownership.select.lockers', 
         ],
         icons: ['list-circle', 'list'],
         title: '@ownership.select.title'
       }
     });
     modal.present();
     const { data, role } = await modal.onDidDismiss();
     if (role === 'confirm') {
       if (data !== undefined) {
         console.log('OwnershipService.selectExportType: data: ' + data);
         return parseInt(data);
       }
     }
     return undefined;
   } */
}
