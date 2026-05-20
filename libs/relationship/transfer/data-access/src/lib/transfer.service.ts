import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { TransferCollection, TransferModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getTransferIndex } from '@bk2/relationship-transfer-util';
import { ActivityService } from '@bk2/activity-data-access';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class TransferService  {
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private readonly env = inject(ENV);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
  });

  /*-------------------------- CRUD operations --------------------------------*/
    /**
   * Create a new transfer relationship and save it to the database.
   * @param transfer the new transfer to save
   * @param currentUser the user who is creating the transfer
   * @returns the document id of the stored transfer in the database or undefined if the operation failed
   */
  public async create(transfer: TransferModel, currentUser?: UserModel): Promise<string | undefined> {
    transfer.index = getTransferIndex(transfer);
    const key = await this.firestoreService.createModel<TransferModel>(TransferCollection, transfer, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    const payload = `${key}: ${transfer.name}/${transfer.type} on ${transfer.dateOfTransfer}`;
    void this.activityService.log('transfer', 'create', currentUser, payload);
    return key;
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
  public async update(transfer: TransferModel, currentUser?: UserModel): Promise<string | undefined> {
    transfer.index = getTransferIndex(transfer);
    const key = await this.firestoreService.updateModel<TransferModel>(TransferCollection, transfer, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    const payload = `${key}: ${transfer.name}/${transfer.type} on ${transfer.dateOfTransfer}`;
    void this.activityService.log('transfer', 'update', currentUser, payload);
    return key;
  }

  /**
   * Delete an existing transfer relationship.
   * @param transfer the transfer to delete
   * @param currentUser the user who is deleting the transfer
   * @returns a promise that resolves when the transfer is deleted
   */
  public async delete(transfer: TransferModel, currentUser?: UserModel): Promise<void> {
    const payload = `${transfer.bkey}: ${transfer.name}/${transfer.type} on ${transfer.dateOfTransfer}`;
    await this.firestoreService.deleteModel<TransferModel>(TransferCollection, transfer, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('transfer', 'delete', currentUser, payload);
  }

  /*-------------------------- LIST  --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<TransferModel[]> {
    return this.firestoreService.searchData<TransferModel>(TransferCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- export --------------------------------*/
  public export(): void {
    console.log('TransferService.export: not yet implemented.');
  }
}
