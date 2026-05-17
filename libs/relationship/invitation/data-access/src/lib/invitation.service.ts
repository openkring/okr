import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { ENV } from '@bk2/shared-config';
import { FirestoreService } from '@bk2/shared-data-access';
import { I18nService } from '@bk2/shared-i18n';
import { InvitationCollection, InvitationModel, UserModel } from '@bk2/shared-models';
import { findByKey, getSystemQuery } from '@bk2/shared-util-core';

import { getInvitationIndex } from '@bk2/relationship-invitation-util';
import { PFX } from './scope';

@Injectable({
  providedIn: 'root'
})
export class InvitationService {
  private readonly firestoreService = inject(FirestoreService);
  private readonly env = inject(ENV);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'operation.create.conf',
    create_error: PFX + 'operation.create.error',
    update_conf:  PFX + 'operation.update.conf',
    update_error: PFX + 'operation.update.error',
    delete_conf:  PFX + 'operation.delete.conf',
    delete_error: PFX + 'operation.delete.error',
  });

  /*-------------------------- CRUD operations --------------------------------*/
    /**
   * Create a new invitation relationship and save it to the database.
   * @param invitation the new invitation to save
   * @param currentUser the user who is creating the invitation
   * @returns the document id of the stored invitation in the database or undefined if the operation failed
   */
  public async create(invitation: InvitationModel, currentUser?: UserModel): Promise<string | undefined> {
    invitation.index = getInvitationIndex(invitation);
    return await this.firestoreService.createModel<InvitationModel>(InvitationCollection, invitation, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
  }
  
  /**
   * Retrieve an existing invitation relationship from the cached list of all invitations.
   * @param key the key of the invitation to retrieve
   * @returns the invitation as an Observable or undefined if not found
   */
  public read(key: string): Observable<InvitationModel | undefined> {
    return findByKey<InvitationModel>(this.list(), key);    
  }

  /**
   * Update an existing invitation relationship with new values.
   * @param invitation the invitation to update
   * @param currentUser the user who is updating the invitation
   * @returns the document id of the updated invitation or undefined if the operation failed
   */
  public async update(invitation: InvitationModel, currentUser?: UserModel): Promise<string | undefined> {
    invitation.index = getInvitationIndex(invitation);
    return await this.firestoreService.updateModel<InvitationModel>(InvitationCollection, invitation, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
  }

  /**
   * Delete an existing invitation relationship.
   * @param invitation the invitation to delete
   * @param currentUser the user who is deleting the invitation
   * @returns a promise that resolves when the invitation is deleted
   */
  public async delete(invitation: InvitationModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<InvitationModel>(InvitationCollection, invitation, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
  }

  /*-------------------------- LIST  --------------------------------*/
  public list(orderBy = 'name', sortOrder = 'asc'): Observable<InvitationModel[]> {
    return this.firestoreService.searchData<InvitationModel>(InvitationCollection, getSystemQuery(this.env.tenantId), orderBy, sortOrder);
  }

  /*-------------------------- export --------------------------------*/
  public export(): void {
    console.log('InvitationService.export: not yet implemented.');
  }
}
