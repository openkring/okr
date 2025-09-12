import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { TransferCollection, TransferModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getTransferSearchIndex, getTransferSearchIndexInfo } from '@bk2/relationship-transfer-util';

@Injectable({
  providedIn: 'root'
})
export class TransferService  {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);

  /*-------------------------- CRUD operations --------------------------------*/
    /**
   * Create a new transfer relationship and save it to the database.
   * @param transfer the new transfer to save
   * @param currentUser the user who is creating the transfer
   * @returns the document id of the stored transfer in the database or undefined if the operation failed
   */
  public async create(transfer: TransferModel, currentUser?: UserModel): Promise<string | undefined> {
    transfer.index = this.getSearchIndex(transfer);
    return await this.firestoreService.createModel<TransferModel>(TransferCollection, transfer, '@transfer.operation.create', currentUser);
  }
  
  /**
   * Retrieve an existing transfer relationship from the cached list of all transfers.
   * @param key the key of the transfer to retrieve
   * @returns the transfer as an Observable or undefined if not found
   */
  public read(key: string): Observable<TransferModel | undefined> {
    return findByKey<TransferModel>(this.list(), key);    
  }

  /**
   * Update an existing transfer relationship with new values.
   * @param transfer the transfer to update
   * @param currentUser the user who is updating the transfer
   * @param confirmMessage the i18n key for the confirmation message to show in a toast
   * @returns the document id of the updated transfer or undefined if the operation failed
   */
  public async update(transfer: TransferModel, currentUser?: UserModel, confirmMessage = '@transfer.operation.update'): Promise<string | undefined> {
    transfer.index = this.getSearchIndex(transfer);
    return await this.firestoreService.updateModel<TransferModel>(TransferCollection, transfer, false, confirmMessage, currentUser);
  }

  /**
   * Delete an existing transfer relationship.
   * @param transfer the transfer to delete
   * @param currentUser the user who is deleting the transfer
   * @returns a promise that resolves when the transfer is deleted
   */
  public async delete(transfer: TransferModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<TransferModel>(TransferCollection, transfer, '@transfer.operation.delete', currentUser);
  }

  /*-------------------------- LIST  --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<TransferModel[]> {
    return this.firestoreService.searchData<TransferModel>(TransferCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- export --------------------------------*/
  public export(): void {
    console.log('TransferService.export: not yet implemented.');
  }

  /*-------------------------- search index --------------------------------*/
  /**
   * Create an index entry for a given organization based on its values.
   * @param org the organization to generate the index for 
   * @returns the index string
   */
  public getSearchIndex(transfer: TransferModel): string {
    return getTransferSearchIndex(transfer);
  }

  /**
   * Returns a string explaining the structure of the index.
   * This can be used in info boxes on the GUI.
   */
  public getTransferSearchIndexInfo(): string {
    return getTransferSearchIndexInfo();
  }
}
