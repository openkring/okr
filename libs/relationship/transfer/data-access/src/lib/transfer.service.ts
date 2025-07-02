import { inject, Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular/standalone';
import { Observable } from 'rxjs';

import { ENV, FIRESTORE } from '@bk2/shared/config';
import { TransferCollection, TransferModel, UserModel } from '@bk2/shared/models';

import { saveComment } from '@bk2/comment/util';
import { getTransferSearchIndex, getTransferSearchIndexInfo } from '@bk2/transfer/util';
import { createModel, findByKey, getSystemQuery, searchData, updateModel } from '@bk2/shared/util-core';
import { confirmAction } from '@bk2/shared/util-angular';
import { bkTranslate } from '@bk2/shared/i18n';

@Injectable({
  providedIn: 'root'
})
export class TransferService  {
  private readonly firestore = inject(FIRESTORE);
  private readonly toastController = inject(ToastController);
  private readonly env = inject(ENV);

  private readonly tenantId = this.env.tenantId;

  /*-------------------------- CRUD operations --------------------------------*/
    /**
   * Create a new transfer relationship and save it to the database.
   * @param transfer the new transfer to save
   * @returns the document id of the stored transfer in the database
   */
  public async create(transfer: TransferModel, currentUser?: UserModel): Promise<string> {
    transfer.index = this.getSearchIndex(transfer);
    const _key = await createModel(this.firestore, TransferCollection, transfer, this.tenantId);
    await saveComment(this.firestore, this.tenantId, currentUser, TransferCollection, _key, '@comment.operation.initial.conf');
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
  public async update(transfer: TransferModel, currentUser?: UserModel, confirmMessage = '@transfer.operation.update'): Promise<string> {
    try {
      transfer.index = this.getSearchIndex(transfer);
      const _key = await updateModel(this.firestore, TransferCollection, transfer);
      await confirmAction(bkTranslate(`${confirmMessage}.conf`), true, this.toastController);
      await saveComment(this.firestore, this.tenantId, currentUser, TransferCollection, _key, '@comment.operation.initial.conf');
      return _key;    
    }
    catch (error) {
      await confirmAction(bkTranslate(`${confirmMessage}.error`), true, this.toastController);
      throw error; // rethrow the error to be handled by the caller
    }
  }

  /**
   * Delete an existing transfer relationship.
   * @param transfer the transfer to delete
   * @returns a promise that resolves when the transfer is deleted
   */
  public async delete(transfer: TransferModel, currentUser?: UserModel): Promise<void> {
    transfer.isArchived = true;
    await this.update(transfer, currentUser, `@transfer.operation.delete`);
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
