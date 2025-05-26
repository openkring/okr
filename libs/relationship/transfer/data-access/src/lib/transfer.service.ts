import { inject, Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { Observable } from 'rxjs';

import { FIRESTORE } from '@bk2/shared/config';
import { createModel, findByKey, getSystemQuery, searchData, updateModel } from '@bk2/shared/data-access';
import { TransferCollection, TransferModel } from '@bk2/shared/models';

import { saveComment } from '@bk2/comment/util';
import { AppStore } from '@bk2/auth/feature';
import { getTransferSearchIndex, getTransferSearchIndexInfo } from '@bk2/transfer/util';

@Injectable({
  providedIn: 'root'
})
export class TransferService  {
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly appStore = inject(AppStore);

  private readonly tenantId = this.appStore.tenantId();

  /*-------------------------- CRUD operations --------------------------------*/
    /**
   * Create a new transfer relationship and save it to the database.
   * @param transfer the new transfer to save
   * @returns the document id of the stored transfer in the database
   */
  public async create(transfer: TransferModel): Promise<string> {
    transfer.index = this.getSearchIndex(transfer);
    const _key = await createModel(this.firestore, TransferCollection, transfer, this.tenantId, '@transfer.operation.create', this.toastController);
    await saveComment(this.firestore, this.tenantId, this.appStore.currentUser(), TransferCollection, _key, '@comment.operation.initial.conf');
    return _key;
  }
  
  /**
   * Retrieve an existing transfer relationship from the cached list of all transfers.
   * @param key the key of the transfer to retrieve
   * @returns the transfer as an Observable
   */
  public read(key: string): Observable<TransferModel | undefined> {
    return findByKey<TransferModel>(this.list(), key);    
  }

  /**
   * Update an existing transfer relationship with new values.
   * @param transfer the transfer to update
   * @param confirmMessage the the toast message that is shown as a confirmation
   */
  public async update(transfer: TransferModel, confirmMessage = '@transfer.operation.update'): Promise<void> {
    transfer.index = this.getSearchIndex(transfer);
    await updateModel(this.firestore, TransferCollection, transfer, confirmMessage, this.toastController);
  }

  /**
   * Delete an existing transfer relationship.
   * @param transfer the transfer to delete
   * @returns a promise that resolves when the transfer is deleted
   */
  public async delete(transfer: TransferModel): Promise<void> {
    transfer.isArchived = true;
    await this.update(transfer, `@transfer.operation.delete`);
  }

  /*-------------------------- LIST  --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<TransferModel[]> {
    return searchData<TransferModel>(this.firestore, TransferCollection, getSystemQuery(this.tenantId), orderBy, sortOrder);
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
