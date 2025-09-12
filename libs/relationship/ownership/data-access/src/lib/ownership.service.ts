import { inject, Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { map, Observable, of } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { ModelType, OwnershipCollection, OwnershipModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getOwnershipSearchIndex, getOwnershipSearchIndexInfo } from '@bk2/relationship-ownership-util';

@Injectable({
  providedIn: 'root'
})
export class OwnershipService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly toastController = inject(ToastController);

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations Ownership --------------------------------*/
  /**
   * Create a new ownership and save it to the database.
   * @param ownership the new ownership to save
   * @param currentUser the current user performing the operation
   * @returns the document id of the stored ownership in the database or undefined if the operation failed
   */
  public async create(ownership: OwnershipModel, currentUser?: UserModel): Promise<string | undefined> {
    ownership.index = this.getSearchIndex(ownership);
    return await this.firestoreService.createModel<OwnershipModel>(OwnershipCollection, ownership, '@ownership.operation.create', currentUser);
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
   * @param confirmMessage the i18n key for the confirmation message
   * @return the document id of the updated ownership in the database or undefined if the operation failed
   */
  public async update(ownership: OwnershipModel, currentUser?: UserModel, confirmMessage = '@ownership.operation.update'): Promise<string | undefined> {
    ownership.index = this.getSearchIndex(ownership);
    return await this.firestoreService.updateModel<OwnershipModel>(OwnershipCollection, ownership, false, confirmMessage, currentUser);
  }

  public async delete(ownership: OwnershipModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<OwnershipModel>(OwnershipCollection, ownership, '@ownership.operation.delete', currentUser);
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
      return await this.firestoreService.updateModel<OwnershipModel>(OwnershipCollection, ownership, false, '@comment.message.ownership.deleted', currentUser);
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
  public listOwnershipsOfOwner(ownerKey: string, modelType: ModelType): Observable<OwnershipModel[]> {
    if (!ownerKey || ownerKey.length === 0) return of([]);

    return this.list().pipe(
      map((ownerships: OwnershipModel[]) => {
        return ownerships.filter((ownership: OwnershipModel) => ownership.ownerKey === ownerKey && ownership.ownerModelType === modelType);
      }));
  }

  /*-------------------------- export --------------------------------*/
  public async export(): Promise<void> {
    //const _index = await this.selectExportType();
    //if (_index === undefined) return;
    //if (_index === 0) {
    console.log('OwnershipService.export: export are not implemented yet.');
    //await exportXlsx(this.filteredItems(), 'all', 'all');
    //}
  }

  /*  private async selectExportType(): Promise<number | undefined> {
     const _modal = await this.modalController.create({
       component: BkLabelSelectModalComponent,
       componentProps: {
         labels: [
           '@ownership.select.raw', 
           '@ownership.select.lockers', 
         ],
         icons: ['list-circle', 'list'],
         title: '@ownership.select.title'
       }
     });
     _modal.present();
     const { data, role } = await _modal.onDidDismiss();
     if (role === 'confirm') {
       if (data !== undefined) {
         console.log('OwnershipService.selectExportType: data: ' + data);
         return parseInt(data);
       }
     }
     return undefined;
   } */

  /* ---------------------- Index operations -------------------------*/
  public getSearchIndex(ownership: OwnershipModel): string {
    return getOwnershipSearchIndex(ownership);
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getSearchIndexInfo(): string {
    return getOwnershipSearchIndexInfo();
  }
}
